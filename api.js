function once(fn) {
  let called = false;
  return function() {
    if (!called) {
      called = true;
      return fn.apply(this, arguments);
    }
  };
}

class DatabaseAPI {
  constructor(url) {
    this.url = url;
  }

  makeRequest(method, url, data, callback) {
    if (typeof data === 'function') {
      callback = data;
      data = undefined;
    }

    callback = once(callback);

    let req = new XMLHttpRequest();
    req.onreadystatechange = () => {
      if (req.readyState === req.DONE) {
        // TODO: Parse error response if status is not 2xx
        callback(req.status, req.responseText);
      }
    };
    req.open(method, url, true);
    req.setRequestHeader('Accept', 'application/json');
    if (method === 'POST' || method === 'PUT')
      req.setRequestHeader('Content-Type', 'application/json');
    req.send(data);
  }

  createDatabase(dbName, callback) {
    this.makeRequest('PUT', `${this.url}/${dbName}`, (statusCode, text) => {
      switch (statusCode) {
        case 201:
          return callback();
        case 400:
          return callback(new Error(`Invalid database name: '${dbName}'`));
        case 401:
          return callback(new Error('Insufficient privileges'));
        case 412:
          return callback(new Error(`Database already exists: '${dbName}'`));
        default:
          return callback(new Error(`Unknown error: ${statusCode}`));
      }
    });
  }

  putDocument(dbName, docName, doc, callback) {
    if (typeof doc === 'function') {
      // docName omitted
      callback = doc;
      doc = docName;
      docName = null;
    }

    let serialized;
    try {
      serialized = JSON.stringify(doc);
    } catch (err) {
      return callback(err);
    }

    let method = 'POST';
    let url = `${this.url}/${dbName}`;
    if (docName != null) {
      method = 'PUT';
      url += `/${docName}`;
    }

    this.makeRequest(method, url, serialized, (statusCode, text) => {
      switch (statusCode) {
        case 201:
        case 202:
          let id = undefined;
          if (docName == null) {
            id = JSON.parse(text).id;
          }
          return callback(null, id);
        case 400:
          return callback(new Error('Invalid parameters'));
        case 401:
          return callback(new Error('Insufficient privileges'));
        case 404:
          return callback(new Error('Not found'));
        default:
          return callback(new Error(`Unknown error: ${statusCode}`));
      }
    });
  }

  getDocument(dbName, docName, callback) {
    this.makeRequest('GET', `${this.url}/${dbName}/${docName}`, (statusCode, text) => {
      if (statusCode !== 200)
        return callback(new Error(`Server returned code ${statusCode}`));
      let doc;
      try {
        doc = JSON.parse(text);
      } catch (err) {
        return callback(err);
      }
      return callback(null, doc);
    });
  }

  executeView(dbName, docName, viewName, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = {};
    }

    let url = `${this.url}/${dbName}/${docName}/_view/${viewName}`;
    Object.keys(params != null ? params : {}).forEach((key, i) => {
      url += (i ? '&' : '?') + key + '=' + encodeURIComponent(JSON.stringify(params[key]));
    });

    this.makeRequest('GET', url, (statusCode, text) => {
      if (statusCode !== 200)
        return callback(new Error(`Server returned code ${statusCode}`));
      let doc;
      try {
        doc = JSON.parse(text);
      } catch (err) {
        return callback(err);
      }
      return callback(null, doc);
    });
  }

  update(dbName, docName, updateName, targetDocName, data, callback) {
    this.makeRequest('PUT', `${this.url}/${dbName}/${docName}/_update/${updateName}/${targetDocName}`, data, (statusCode, text) => {
      if (statusCode < 200 || statusCode > 201)
        return callback(new Error(`Server returned code ${statusCode}`));
      return callback();
    });
  }
}

class DataAPI {
  constructor(dbApi, dbName) {
    this.dbApi = dbApi;
    this.dbName = dbName;
  }

  createDatabase(callback) {
    this.dbApi.createDatabase(this.dbName, err => {
      if (err && !/already exists/i.test(String(err)))
        return callback(err);

      const docs = {
        '_design/lectures': {
          views: {
            'get-lectures': {
              map: `function (doc) {
                      if (doc.docType === 'lecture')
                        emit(doc._id, doc);
                    }`
            },
            'get-questions-by-lecture': {
              map: `function (doc) {
                      if (doc.docType === 'question')
                        emit(doc.lectureId, doc);
                    }`
            },
            'get-answers-by-question': {
              map: `function (doc) {
                      if (doc.docType === 'answer')
                        emit(doc.questionId, doc);
                    }`
            },
            'get-number-of-questions-by-lecture': {
              map: `function (doc) {
                      if (doc.docType === 'question')
                        emit(doc.lectureId, 1);
                    }`,
              reduce: '_sum'
            },
            'get-number-of-answers-by-question': {
              map: `function (doc) {
                      if (doc.docType === 'answer')
                        emit(doc.questionId, 1);
                    }`,
              reduce: '_sum'
            }
          },
          language: 'javascript'
        },
        '_design/users': {
          views: {
            'get-attended-lectures': {
              map: `function (doc) {
                      if (doc.docType === 'user') {
                        for (var i = 0; i < doc.attendedLectures.length; i++) {
                          emit(doc._id, { _id: doc.attendedLectures[i] });
                        }
                      }
                    }`
            },
            'get-display-names-by-id': {
              map: `function (doc) {
                      if (doc.docType === 'user' && doc.displayName != null) {
                        emit(doc._id, doc.displayName);
                      }
                    }`
            },
            'get-users-by-username': {
              map: `function (doc) {
                      if (doc.docType === 'user')
                        emit(doc.username.toLowerCase(), doc);
                    }`
            }
          },
          updates: {
            'attend-lecture': `function(doc, req){
                                 if (!doc) {
                                   return [
                                     null,
                                     {
                                       code: 400,
                                       json: {
                                         error: 'missed',
                                         reason: 'no document'
                                       }
                                     }
                                   ];
                                 }
  
                                 if (doc.docType !== 'user') {
                                   return [
                                     null,
                                     {
                                       code: 400,
                                       json: {
                                         error: 'missed',
                                         reason: 'invalid document type'
                                       }
                                     }
                                   ];
                                 }
  
                                 if (typeof req.body !== 'string') {
                                   return [
                                     null,
                                     {
                                       code: 400,
                                       json: {
                                         error: 'missed',
                                         reason: 'invalid request body'
                                       }
                                     }
                                   ];
                                 }
  
                                 if (doc.attendedLectures.indexOf(req.body) === -1)
                                   doc.attendedLectures.push(req.body);
                                 return [doc, { json: { status: 'ok' } }];
                               }`
          },
          language: 'javascript'
        }
      };

      let remaining = Object.keys(docs), next;
      (next = () => {
        if (remaining.length === 0)
          return callback();
        let key = remaining.shift();
        this.dbApi.putDocument(this.dbName, key, docs[key], err => {
          return err ? callback(err) : next();
        });
      })();
    });
  }

  createUser(username, displayName, password, callback) {
    // Don't ever save passwords in real applications!
    this.dbApi.putDocument(this.dbName, {
      docType: 'user', username, displayName, password, attendedLectures: []
    }, callback);
  }

  createLecture(name, callback) {
    this.dbApi.putDocument(this.dbName, { docType: 'lecture', name }, callback);
  }

  attendLecture(userId, lectureId, callback) {
    this.dbApi.update(this.dbName, '_design/users', 'attend-lecture', userId, lectureId, callback);
  }

  getLectures(keys, callback) {
    if (typeof keys === 'function') {
      callback = keys;
      keys = null;
    }

    const params = Array.isArray(keys) ? { keys } : null;
    this.dbApi.executeView(this.dbName, '_design/lectures', 'get-lectures', params, (err, result) => {
      if (err)
        return callback(err);
      return callback(null, result.rows.map(row => row.value));
    });
  }

  postQuestion(lectureId, title, author, callback) {
    const time = +new Date();
    this.dbApi.putDocument(this.dbName, { docType: 'question', lectureId, title, time, author }, callback);
  }

  postAnswer(questionId, text, author, callback) {
    const time = +new Date();
    this.dbApi.putDocument(this.dbName, { docType: 'answer', questionId, text, time, author }, callback);
  }

  getQuestionById(questionId, callback) {
    this.dbApi.getDocument(this.dbName, questionId, callback);
  }

  // TODO: Sort by date
  getQuestionsByLecture(lectureId, callback) {
    this.dbApi.executeView(this.dbName, '_design/lectures', 'get-questions-by-lecture', { key: lectureId }, (err, result) => {
      if (err)
        return callback(err);
      return callback(null, result.rows.map(row => row.value));
    });
  }

  getNumberOfQuestionsByLecture(lectureIds, callback) {
    this.dbApi.executeView(this.dbName, '_design/lectures', 'get-number-of-questions-by-lecture', { keys: lectureIds, group: true }, (err, result) => {
      if (err)
        return callback(err);
      let counts = {};
      for (let row of result.rows)
        counts[row.key] = row.value;
      for (let id of lectureIds) {
        if (!(id in counts))
          counts[id] = 0;
      }
      return callback(null, counts);
    });
  }

  getNumberOfAnswersByQuestion(questionIds, callback) {
    this.dbApi.executeView(this.dbName, '_design/lectures', 'get-number-of-answers-by-question', { keys: questionIds, group: true }, (err, result) => {
      if (err)
        return callback(err);
      let counts = {};
      for (let row of result.rows)
        counts[row.key] = row.value;
      for (let id of lectureIds) {
        if (!(id in counts))
          counts[id] = 0;
      }
      return callback(null, counts);
    });
  }

  // TODO: Sort by date
  getAnswersForQuestion(questionId, callback) {
    this.dbApi.executeView(this.dbName, '_design/lectures', 'get-answers-by-question', { key: questionId }, (err, result) => {
      if (err)
        return callback(err);
      return callback(null, result.rows.map(row => row.value));
    });
  }

  getUserById(userId, callback) {
    this.dbApi.getDocument(this.dbName, userId, callback);
  }

  getUserByUsername(username, callback) {
    this.dbApi.executeView(this.dbName, '_design/users', 'get-users-by-username', { key: username.toLowerCase() }, (err, result) => {
      if (err)
        return callback(err);
      return callback(null, (result.rows[0] || {}).value);
    });
  }

  getUserDisplayName(id, callback) {
    this.dbApi.executeView(this.dbName, '_design/users', 'get-display-names-by-id', { key: id }, (err, result) => {
      if (err)
        return callback(err);
      return callback(null, (result.rows[0] || {}).value);
    });
  }

  getUserDisplayNames(ids, callback) {
    this.dbApi.executeView(this.dbName, '_design/users', 'get-display-names-by-id', { keys: ids }, (err, result) => {
      if (err)
        return callback(err);

      let names = {};
      for (let row of result.rows) {
        names[row.key] = row.value;
      }
      return callback(null, names);
    });
  }

  getAttendedLectures(userId, callback) {
    this.dbApi.executeView(this.dbName, '_design/users', 'get-attended-lectures', { key: userId, include_docs: true }, (err, result) => {
      if (err)
        return callback(err);
      return callback(null, result.rows.map(row => row.doc));
    });
  }
}
