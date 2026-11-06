document.addEventListener('DOMContentLoaded', loadModels);

function setText(id, text, isError) {
  const el = document.getElementById(id);
  el.textContent = text || '';
  el.classList.toggle('error', !!isError);
  el.hidden = !text;
}

async function loadModels() {
  const list = document.getElementById('appModels');
  setText('modelsStatus', 'Loading models…');
  try {
    const resp = await fetch('/api/models');
    if (!resp.ok) throw new Error(resp.statusText);
    const models = (await resp.json()).sort((a, b) => a.name.localeCompare(b.name));
    const buttons = new Map();
    list.replaceChildren(...models.map(model => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = button.title = model.name;
      button.addEventListener('click', () => selectModel(button, model));
      buttons.set(model.name, button);
      const item = document.createElement('li');
      item.appendChild(button);
      return item;
    }));
    setText('modelsStatus', models.length ? '' : 'No models available.');

    // Deep link: /?extension=<name> opens the sample Office model (the extension loader enables the extension).
    if (new URLSearchParams(window.location.search).has('extension')) {
      buttons.get('Office.rvt')?.click();
    }
  } catch (err) {
    console.error(err);
    list.replaceChildren();
    setText('modelsStatus', 'Could not load the list of models.', true);
  }
}

function selectModel(button, model) {
  document.querySelector('#appModels button[aria-current]')?.removeAttribute('aria-current');
  button.setAttribute('aria-current', 'true');
  setText('viewerMessage', '');
  launchViewer(model.urn, model.name);
}
