class Event {
  constructor() {
    this.listeners = [];
  }

  emit(value) {
    let listeners = this.listeners.slice();
    for (let listener of listeners) {
      listener(value);
    }
  }

  addListener(listener) {
    if (this.listeners.indexOf(listener) === -1)
      this.listeners.push(listener);
  }

  removeListener(listener) {
    let index = this.listeners.indexOf(listener);
    if (index !== -1)
      this.listeners.splice(index, 1);
  }
}

class Observable {
  constructor(value) {
    this.onChange = new Event();
    this._value = value;
  }

  get value() {
    return this._value;
  }

  set value(val) {
    this._value = val;
    this.onChange.emit(val);
  }
}

class ActivityStack {
  constructor(hostElement) {
    if (!hostElement)
      throw new Error('Host element must be specified');
    this.hostElement = hostElement;
    this.items = [];
    this.onStackChanged = new Event();
  }

  startActivity(activity, callback) {
    if (this.items.length) {
      let currentItem = this.items[this.items.length - 1];
      currentItem.activity.onPause();
      this.hostElement.removeChild(currentItem.activity.rootElement);
    }
    this.items.push({ activity, callback });
    activity.onAttachToStack(this);
    activity.onStart();
    activity.onResume();
    this.hostElement.appendChild(activity.rootElement);
    this.onStackChanged.emit(this.items.map(item => item.activity));
  }

  returnFromActivity(activity, result) {
    if (this.items.length === 0)
      throw new Error('Activity stack is empty');
    let currentItem = this.items[this.items.length - 1];
    if (currentItem.activity !== activity)
      throw new Error('Trying to return from paused activity');
    this.hostElement.removeChild(activity.rootElement);
    activity.onPause();
    activity.onStop();
    this.items.pop();
    if (currentItem.callback)
      currentItem.callback(result);
    activity.onDetachFromStack();
    let nextItem = this.items[this.items.length - 1];
    if (nextItem) {
      nextItem.activity.onResume();
      this.hostElement.appendChild(nextItem.activity.rootElement);
    }
    this.onStackChanged.emit(this.items.map(item => item.activity));
  }
}

class Activity {
  constructor(title, rootElement) {
    this.rootElement = rootElement;
    this._activityTitle = new Observable(title);
    this._activityId = this.constructor.name + '#' + Math.random().toString(16).substr(2);
  }

  get title() {
    return this._activityTitle;
  }

  startActivity(activity, callback) {
    this.activityStack.startActivity(activity, callback);
  }

  returnFromActivity(result) {
    this.activityStack.returnFromActivity(this, result);
  }

  onAttachToStack(activityStack) {
    console.log(`${this._activityId}.onAttachToStack()`);
    this.activityStack = activityStack;
  }

  onStart() {
    console.log(`${this._activityId}.onStart()`);
  }

  onResume() {
    console.log(`${this._activityId}.onResume()`);
  }

  onPause() {
    console.log(`${this._activityId}.onPause()`);
  }

  onStop() {
    console.log(`${this._activityId}.onStop()`);
  }

  onDetachFromStack() {
    console.log(`${this._activityId}.onDetachFromStack()`);
    this.activityStack = null;
  }

  navigationRequestReturnFromActivity() {
    this.returnFromActivity();
  }
}

function findElements(root, selectors) {
  const elements = {};
  for (let key of Object.keys(selectors)) {
    elements[key] = root.querySelector(selectors[key]);
  }
  return elements;
}

class LectureMenuActivity extends Activity {
  constructor(context) {
    super('Veranstaltungen', LectureMenuActivity.createElement());
    this.context = context;

    this.rootElement.querySelector('.more-lectures-button').addEventListener('click', event => {
      event.preventDefault();

      this.startActivity(new AllLecturesActivity(this.context));
    });
  }

  onResume() {
    super.onResume();

    const { list, noLecturesMessage } = findElements(this.rootElement, {
      list: '.lecture-list',
      noLecturesMessage: '.no-lectures'
    });

    let userId = this.context.currentUserId;
    this.context.dataApi.getUserById(userId, (err, user) => {
      if (err)
        return alert(`Failed to retrieve user information: ${err}`);
      // TODO: Show current user somewhere
    });

    this.context.dataApi.getAttendedLectures(userId, (err, lectures) => {
      if (err)
        return alert(`Failed to retrieve data from server: ${err}`);

      let lectureIds = lectures.map(l => l._id);
      this.context.dataApi.getNumberOfQuestionsByLecture(lectureIds, (err, questionCounts) => {
        if (err) {
          alert(`Failed to retrieve data from server: ${err}`);
          questionCounts = {};
        }

        list.innerHTML = '';
        noLecturesMessage.style.display = lectures.length ? 'none' : 'block';
        lectures.forEach(lecture => {
          let item = document.createElement('a');
          item.classList.add('list-group-item', 'list-group-item-action', 'd-flex', 'justify-content-between', 'align-items-center');
          item.textContent = lecture.name;
          item.setAttribute('href', '#');
          if (typeof questionCounts[lecture._id] === 'number') {
            let badge = document.createElement('span');
            badge.classList.add('badge', 'badge-primary', 'badge-pill');
            let count = questionCounts[lecture._id];
            badge.textContent = count === 1 ? `${count} Frage` : `${count} Fragen`;
            item.appendChild(badge);
          }
          // TODO: Add badge with number of questions
          item.addEventListener('click', event => {
            event.preventDefault();
            this.startActivity(new LectureOverviewActivity(this.context, lecture));
          });
          list.appendChild(item);
        });
      });
    });
  }

  static createElement() {
    let elem = document.createElement('div');
    elem.classList.add('activity');
    let title = document.createElement('h1');
    title.classList.add('activity-title');
    title.innerText = 'Veranstaltungen';
    elem.appendChild(title);
    let noLectures = document.createElement('p');
    noLectures.classList.add('no-lectures', 'alert', 'alert-primary');
    noLectures.innerText = 'Sie sind bisher keiner Veranstaltung beigetreten.';
    noLectures.style.display = 'none';
    elem.appendChild(noLectures);
    let list = document.createElement('div');
    list.classList.add('lecture-list', 'list-group', 'my-3');
    elem.appendChild(list);
    let moreLecturesButton = document.createElement('a');
    moreLecturesButton.classList.add('more-lectures-button');
    moreLecturesButton.setAttribute('href', '#');
    moreLecturesButton.innerText = 'Weitere Veranstaltungen';
    elem.appendChild(moreLecturesButton);
    return elem;
  }
}

class AllLecturesActivity extends Activity {
  constructor(context) {
    super('Weitere Veranstaltungen', AllLecturesActivity.createElement());
    this.context = context;

    this.rootElement.querySelector('.my-lectures-button').addEventListener('click', event => {
      event.preventDefault();

      // Hopefully, the last activity is still the "My lectures" activity
      this.returnFromActivity();
    });
  }

  onResume() {
    super.onResume();
    this.reloadList();
  }

  reloadList() {
    const { list, noLecturesMessage } = findElements(this.rootElement, {
      list: '.lecture-list',
      noLecturesMessage: '.no-lectures'
    });

    this.context.dataApi.getLectures((err, allLectures) => {
      if (err)
        return alert(`Failed to retrieve lectures: ${err}`);
      this.context.dataApi.getAttendedLectures(this.context.currentUserId, (err, myLectures) => {
        if (err)
          return alert('Failed to retrieve user information: ' + err);

        const availableLectures = allLectures.filter(lecture => {
          return !myLectures.find(l => l._id === lecture._id);
        });

        list.innerHTML = '';
        noLecturesMessage.style.display = availableLectures.length ? 'none' : 'block';
        availableLectures.forEach(lecture => {
          let item = document.createElement('a');
          item.classList.add('list-group-item', 'list-group-item-action');
          item.textContent = lecture.name;
          item.setAttribute('href', '#');
          // TODO: Add badge with number of questions
          item.addEventListener('click', event => {
            event.preventDefault();
            // TODO: Use a modal here
            if (confirm(`Möchten Sie der Veranstaltung "${lecture.name}" beitreten?`))
              this.attendLecture(lecture._id);
          });
          list.appendChild(item);
        });
      });
    });
  }

  attendLecture(lectureId) {
    this.context.dataApi.attendLecture(this.context.currentUserId, lectureId, err => {
      if (err)
        alert(`Failed to update settings: ${err}`);
      this.reloadList();
    });
  }

  static createElement() {
    let elem = document.createElement('div');
    elem.classList.add('activity');
    let title = document.createElement('h1');
    title.classList.add('activity-title');
    title.innerText = 'Weitere Veranstaltungen';
    elem.appendChild(title);
    let noLectures = document.createElement('p');
    noLectures.classList.add('no-lectures', 'alert', 'alert-primary');
    noLectures.innerText = 'Sie sind allen Veranstaltungen beigetreten.';
    noLectures.style.display = 'none';
    elem.appendChild(noLectures);
    let list = document.createElement('div');
    list.classList.add('lecture-list', 'list-group');
    elem.appendChild(list);
    let moreLecturesButton = document.createElement('a');
    moreLecturesButton.classList.add('my-lectures-button');
    moreLecturesButton.setAttribute('href', '#');
    moreLecturesButton.innerText = 'Zurück zu meinen Veranstaltungen';
    elem.appendChild(moreLecturesButton);
    return elem;
  }
}

class LectureOverviewActivity extends Activity {
  constructor(context, lecture) {
    super(lecture.name, LectureOverviewActivity.createElement());
    this.context = context;
    this.lecture = lecture;

    this.rootElement.querySelector('.ask-question-button').addEventListener('click', event => {
      event.preventDefault();
      this.startActivity(new AskQuestionActivity(this.context, this.lecture), questionId => {
        if (questionId) {
          this.context.dataApi.getQuestionById(questionId, (err, question) => {
            if (err)
              return alert(`Failed to retrieve question: ${err}`);
            this.startActivity(new ViewQuestionActivity(this.context, this.lecture, question));
          });
        }
      });
    });
  }

  onResume() {
    super.onResume();

    this.reloadQuestions();
    this.reloadInterval = setInterval(() => this.reloadQuestions(), 5000);
  }

  onPause() {
    super.onPause();
    clearInterval(this.reloadInterval);
  }

  reloadQuestions() {
    this.context.dataApi.getQuestionsByLecture(this.lecture._id, (err, questions) => {
      if (err)
        return alert(`Retrieving data from server failed: ${err}`);

      let userIds = questions.map(q => q.author).filter(a => a != null);
      this.context.dataApi.getUserDisplayNames(userIds, (err, userNames) => {
        if (err) {
          alert(`Failed to retrieve user information: ${err}`);
          userNames = {};
        }

        let questionIds = questions.map(q => q._id);
        this.context.dataApi.getNumberOfAnswersByQuestion(questionIds, (err, answerCounts) => {
          if (err) {
            alert(`Failed to retrieve data from server: ${err}`);
            questionCounts = {};
          }

          let list = this.rootElement.querySelector('.question-list');
          list.innerHTML = '';
          questions.forEach(question => {
            let item = document.createElement('a');
            item.setAttribute('href', '#');
            item.classList.add('list-group-item', 'list-group-item-action', 'flex-column', 'align-items-start');
            let header = document.createElement('div');
            header.classList.add('d-fle', 'w-100', 'justify-content-between');
            let title = document.createElement('h5');
            title.classList.add('mb-1');
            title.textContent = question.title;
            header.appendChild(title);
            let meta = document.createElement('small');
            let userName = question.author == null ? 'anonym' : (userNames[question.author] == null ?
                                                                 'unbekannt' :
                                                                 userNames[question.author]);
            let metaText = `Von ${userName} ${moment(question.time).fromNow()}`;
            if (typeof answerCounts[question._id] == 'number') {
              let count = answerCounts[question._id];
              let w = count === 1 ? 'Antwort' : 'Antworten';
              metaText += ` • ${count} ${w}`;
            }
            meta.textContent = metaText;
            header.appendChild(meta);
            item.appendChild(header);
            item.addEventListener('click', event => {
              event.preventDefault();
              this.startActivity(new ViewQuestionActivity(this.context, this.lecture, question));
            });
            list.appendChild(item);
          });
        });
      });
    });
  }

  static createElement() {
    let elem = document.createElement('div');
    elem.classList.add('activity');
    let title = document.createElement('h1');
    title.classList.add('activity-title');
    title.textContent = 'Fragen';
    elem.appendChild(title);
    let askQuestionButton = document.createElement('button');
    askQuestionButton.setAttribute('type', 'button');
    askQuestionButton.classList.add('ask-question-button', 'btn', 'btn-primary');
    askQuestionButton.textContent = 'Frage stellen';
    elem.appendChild(askQuestionButton);
    let list = document.createElement('div');
    list.classList.add('question-list', 'list-group', 'my-3');
    elem.appendChild(list);
    return elem;
  }
}

class AskQuestionActivity extends Activity {
  constructor(context, lecture) {
    super('Frage stellen', AskQuestionActivity.createElement());
    this.context = context;
    this.lecture = lecture;

    this.rootElement.querySelector('.post-question-form').addEventListener('submit', event => {
      event.preventDefault();
      const text = this.rootElement.querySelector('.question-input').value.replace(/^\s+|\s+$/g, '');
      if (text.length === 0)
        return alert('Bitte geben Sie eine Frage ein.');
      const checkbox = this.rootElement.querySelector('#post-anonymously-check');
      const postAnonymously = checkbox.checked;
      const author = postAnonymously ? null : this.context.currentUserId;
      this.context.dataApi.postQuestion(this.lecture._id, text, author, (err, questionId) => {
        if (err)
          return alert(`Failed to post question: ${err}`);
        this.returnFromActivity(questionId);
      });
    });
  }

  static createElement() {
    let elem = document.createElement('div');
    elem.classList.add('activity');
    let title = document.createElement('h1');
    title.classList.add('activity-title');
    title.textContent = 'Frage stellen';
    elem.appendChild(title);
    let form = document.createElement('form');
    form.classList.add('post-question-form');
    let group1 = document.createElement('div');
    group1.classList.add('form-group');
    let inputField = document.createElement('input');
    inputField.setAttribute('type', 'text');
    inputField.setAttribute('placeholder', 'Ihre Frage');
    inputField.classList.add('question-input', 'form-control');
    group1.appendChild(inputField);
    form.appendChild(group1);
    let group2 = document.createElement('div');
    group2.classList.add('form-check');
    let anonymousCheckbox = document.createElement('input');
    anonymousCheckbox.classList.add('form-check-input');
    anonymousCheckbox.setAttribute('type', 'checkbox');
    anonymousCheckbox.id = 'post-anonymously-check';
    group2.appendChild(anonymousCheckbox);
    let anonymousLabel = document.createElement('label');
    anonymousLabel.classList.add('form-check-label');
    anonymousLabel.setAttribute('for', 'post-anonymously-check');
    anonymousLabel.textContent = 'Frage anonym stellen';
    group2.appendChild(anonymousLabel);
    form.appendChild(group2);
    let submitButton = document.createElement('input');
    submitButton.setAttribute('type', 'submit');
    submitButton.setAttribute('value', 'Frage stellen');
    submitButton.classList.add('send-question-button', 'btn', 'btn-primary', 'my-3');
    form.appendChild(submitButton);
    elem.appendChild(form);
    return elem;
  }
}

class ViewQuestionActivity extends Activity {
  constructor(context, lecture, question) {
    super(question.title, ViewQuestionActivity.createElement());
    this.context = context;
    this.lecture = lecture;
    this.question = question;

    this.rootElement.querySelector('.post-answer-form').addEventListener('submit', event => {
      event.preventDefault();
      const text = this.rootElement.querySelector('.answer-input').value.replace(/^\s+|\s+$/g, '');
      if (text.length === 0)
        return alert('Bitte geben Sie eine Frage ein.');
      const checkbox = this.rootElement.querySelector('#post-anonymously-check');
      const postAnonymously = checkbox.checked;
      const author = postAnonymously ? null : this.context.currentUserId;
      this.context.dataApi.postAnswer(this.question._id, text, author, (err, answerId) => {
        if (err)
          return console.error(`Failed to post answer: ${err}`);
        this.rootElement.querySelector('.answer-input').value = '';
        this.reloadAnswers();
      });
    });
  }

  onResume() {
    super.onResume();

    const reloadData = () => {
      this.reloadMeta();
      this.reloadAnswers();
    };

    reloadData();
    this.reloadInterval = setInterval(reloadData, 2500);
  }

  onPause() {
    super.onPause();
    clearInterval(this.reloadInterval);
  }

  reloadMeta() {
    const { title, meta } = findElements(this.rootElement, {
      title: '.activity-title',
      meta: '.meta-info'
    });
    title.textContent = this.question.title;

    const updateMeta = username => {
      meta.textContent = `Von ${username} ${moment(this.question.time).fromNow()}`;
    };

    if (this.question.author == null) {
      updateMeta('anonym');
    } else {
      this.context.dataApi.getUserDisplayName(this.question.author, (err, name) => {
        if (err)
          return alert(`Failed to retrieve user information: ${err}`);
        updateMeta(name == null ? 'anonym' : name);
      });
    }
  }

  reloadAnswers() {
    this.context.dataApi.getAnswersForQuestion(this.question._id, (err, answers) => {
      if (err)
        return alert(`Retrieving data from server failed: ${err}`);

      let userIds = answers.map(answer => answer.author).filter(a => a != null);
      this.context.dataApi.getUserDisplayNames(userIds, (err, userNames) => {
        if (err) {
          alert(`Failed to retrieve user information: ${err}`);
          userNames = {};
        }

        let list = this.rootElement.querySelector('.answer-list');
        list.innerHTML = '';
        answers.forEach(answer => {
          let item = document.createElement('div');
          item.classList.add('card', 'my-3');
          let header = document.createElement('div');
          header.classList.add('card-header');
          let title = document.createElement('small');
          title.classList.add('text-muted');
          let userName = answer.author == null ? 'anonym' : (userNames[answer.author] == null ?
                                                             'unbekannt' :
                                                             userNames[answer.author]);
          title.textContent = `Von ${userName} ${moment(answer.time).fromNow()}`;
          header.appendChild(title);
          item.appendChild(header);
          let body = document.createElement('div');
          body.classList.add('card-body');
          for (let paragraph of answer.text.split(/\r?\n/g)) {
            paragraph = paragraph.replace(/^\s+|\s+$/g, '');
            if (paragraph.length) {
              let text = document.createElement('p');
              text.classList.add('card-text');
              text.textContent = paragraph;
              body.appendChild(text);
            }
          }
          item.appendChild(body);
          list.appendChild(item);
        });
      });
    });
  }

  static createElement() {
    let elem = document.createElement('div');
    elem.classList.add('activity');
    let title = document.createElement('h1');
    title.classList.add('activity-title');
    elem.appendChild(title);
    let meta = document.createElement('small');
    meta.classList.add('meta-info', 'text-muted');
    elem.appendChild(meta);
    let list = document.createElement('div');
    list.classList.add('answer-list');
    elem.appendChild(list);
    let answerForm = document.createElement('form');
    answerForm.classList.add('post-answer-form');
    let group1 = document.createElement('div');
    group1.classList.add('form-group');
    let answerField = document.createElement('textarea');
    answerField.classList.add('answer-input', 'form-control');
    answerField.setAttribute('placeholder', 'Ihr Kommentar');
    answerField.setAttribute('rows', 4);
    group1.appendChild(answerField);
    answerForm.appendChild(group1);
    let group2 = document.createElement('div');
    group2.classList.add('form-check');
    let anonymousCheckbox = document.createElement('input');
    anonymousCheckbox.classList.add('form-check-input');
    anonymousCheckbox.setAttribute('type', 'checkbox');
    anonymousCheckbox.id = 'post-anonymously-check';
    group2.appendChild(anonymousCheckbox);
    let anonymousLabel = document.createElement('label');
    anonymousLabel.classList.add('form-check-label');
    anonymousLabel.setAttribute('for', 'post-anonymously-check');
    anonymousLabel.textContent = 'Anonym antworten';
    group2.appendChild(anonymousLabel);
    answerForm.appendChild(group2);
    let answerButton = document.createElement('input');
    answerButton.classList.add('post-answer-button', 'btn', 'btn-primary', 'my-3');
    answerButton.setAttribute('type', 'submit');
    answerButton.setAttribute('value', 'Senden');
    answerForm.appendChild(answerButton);
    elem.appendChild(answerForm);
    return elem;
  }
}

class LoginActivity extends Activity {
  constructor(context) {
    super('Anmeldung', LoginActivity.createElement());
    this.context = context;

    const { usernameInput, passwordInput, form } = findElements(this.rootElement, {
      usernameInput: '.username-input',
      passwordInput: '.password-input',
      form: '.login-form'
    });

    form.addEventListener('submit', event => {
      event.preventDefault();

      const username = usernameInput.value.replace(/^\s+|\s+$/g, '');
      const password = passwordInput.value;
      if (username.length > 0) {
        this.context.dataApi.getUserByUsername(username, (err, user) => {
          if (err)
            return alert(`Failed to retrieve data: ${err}`);
          if (!user)
            return alert('Benutzer nicht gefunden.');
          if (user.password !== password)
            return alert('Passwort inkorrekt.');
          this.returnFromActivity(user._id);
        });
      }
    });
  }

  static createElement() {
    const elem = document.createElement('div');
    elem.classList.add('activity');

    let title = document.createElement('h1');
    title.classList.add('activity-title');
    title.textContent = 'Anmeldung';
    elem.appendChild(title);

    const form = document.createElement('form');
    form.classList.add('login-form');
    const group1 = document.createElement('div');
    group1.classList.add('form-group');
    const label1 = document.createElement('label');
    label1.setAttribute('for', 'username-input-field');
    label1.textContent = 'Benutzername';
    group1.appendChild(label1);
    const input1 = document.createElement('input');
    input1.id = 'username-input-field';
    input1.setAttribute('type', 'text');
    input1.classList.add('form-control', 'username-input');
    group1.appendChild(input1);
    form.appendChild(group1);
    const group2 = document.createElement('div');
    group2.classList.add('form-group');
    const label2 = document.createElement('label');
    label2.setAttribute('for', 'password-input-field');
    label2.textContent = 'Passwort';
    group2.appendChild(label2);
    const input2 = document.createElement('input');
    input2.id = 'password-input-field';
    input2.setAttribute('type', 'password');
    input2.classList.add('form-control', 'password-input');
    group2.appendChild(input2);
    form.appendChild(group2);
    const button = document.createElement('button');
    button.classList.add('btn', 'btn-primary', 'login-button');
    button.textContent = 'Anmelden';
    form.appendChild(button);
    elem.appendChild(form);

    return elem;
  }
}

class StackBreadcrumb {
  constructor(activityStack, breadcrumbElement) {
    let currentlyObservedActivity = null;

    function changeTitle(title) {
      document.title = title;
    }

    activityStack.onStackChanged.addListener(activities => {
      if (currentlyObservedActivity != null)
        currentlyObservedActivity.title.onChange.removeListener(changeTitle);

      currentlyObservedActivity = activities[activities.length - 1];
      if (currentlyObservedActivity) {
        changeTitle(currentlyObservedActivity.title.value);
        currentlyObservedActivity.title.onChange.addListener(changeTitle);
        // TODO: Also update breadcrumb items
      }

      breadcrumbElement.innerHTML = '';
      for (let i = 0; i < activities.length; i++) {
        let item = document.createElement('li');
        let actual = item;
        if (i === activities.length - 1) {
          item.classList.add('active');
        } else if (i === activities.length - 2) {
          actual = document.createElement('a');
          actual.setAttribute('href', '#');
          actual.addEventListener('click', event => {
            event.preventDefault();
            currentlyObservedActivity.navigationRequestReturnFromActivity();
          });
          item.appendChild(actual);
        }
        // TODO: Observe title (but also don't forget to remove the listeners later to avoid memory leaks)
        actual.textContent = activities[i].title.value;
        item.classList.add('breadcrumb-item');
        breadcrumbElement.appendChild(item);
      }
    });
  }
}

class AppContext {
  constructor(dataApi, userId) {
    this.dataApi = dataApi;
    this._userId = new Observable(userId);
  }

  get userId() {
    return this._userId;
  }

  set userId(userId) {
    this._userId.value = userId;
  }

  get currentUserId() {
    return this._userId.value;
  }
}

window.addEventListener('load', () => {
  moment.locale('de');

  const dbApi = new DatabaseAPI('http://127.0.0.1:5984');
  const dataApi = new DataAPI(dbApi, 'hci-qanda');
  const stack = new ActivityStack(document.getElementById('app'));
  const nav = new StackBreadcrumb(stack, document.getElementById('stack-nav'));

  const context = new AppContext(dataApi, null);

  stack.startActivity(new LoginActivity(context), userId => {
    context.userId = userId;
    console.log(`Logged in as ${userId}`);
    stack.startActivity(new LectureMenuActivity(context));
  });
});