window.addEventListener('load', () => {
  function log(msg) {
    console.log(msg);
    document.getElementById('log-text').textContent += msg + '\n';
  }

  const dbApi = new DatabaseAPI('http://127.0.0.1:5984');
  const dataApi = new DataAPI(dbApi, 'hci-qanda');

  document.getElementById('install-database-button').addEventListener('click', () => {
    log('Installiere Datenbank...');
    dataApi.createDatabase(err => {
      if (err) {
        log(`Installation fehlgeschlagen: ${err}`);
        alert(`Installation fehlgeschlagen: ${err}`);
      } else {
        log('Datenbank eingerichtet.');
      }
    });
  });

  document.getElementById('create-lecture-form').addEventListener('submit', event => {
    event.preventDefault();

    const input = document.getElementById('lecture-name-input');
    let name = input.value.replace(/^\s+|\s+$/g, '');
    if (name.length === 0)
      return log('Fehler: Kein Name eingegeben');
    log(`Erstelle Veranstaltung '${name}'...`);
    dataApi.createLecture(name, (err, id) => {
      if (err) {
        log(`Speichern fehlgeschlagen: ${err}`);
        alert(`Speichern fehlgeschlagen: ${err}`);
      } else {
        log(`Veranstaltung ${id} ('${name}') erstellt.`);
        input.value = '';
      }
    });
  });

  document.getElementById('create-user-form').addEventListener('submit', event => {
    event.preventDefault();

    const usernameInput = document.getElementById('user-username-input');
    const publicNameInput = document.getElementById('user-public-name-input');
    const passwordInput = document.getElementById('user-password-input');

    let username = usernameInput.value.replace(/^\s+|\s+$/g, '');
    if (username.length === 0)
      return log('Fehler: Kein Benutzername eingegeben');

    let publicName = publicNameInput.value.replace(/^\s+|\s+$/g, '');
    if (publicName.length === 0)
      return log('Fehler: Kein öffentlicher Name eingegeben');

    let password = passwordInput.value;
    if (password.length === 0)
      return log('Fehler: Kein Passwort eingegeben');

    log(`Erstelle Benutzer '${username}' ('${publicName}')...`);
    dataApi.createUser(username, publicName, password, (err, id) => {
      if (err) {
        log(`Speichern fehlgeschlagen: ${err}`);
        alert(`Speichern fehlgeschlagen: ${err}`);
      } else {
        log(`Benutzer ${id} ('${username}') erstellt.`);
        usernameInput.value = '';
        publicNameInput.value = '';
        passwordInput.value = '';
      }
    });
  });
});