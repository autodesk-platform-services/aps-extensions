let viewer;
var fileName; // Read as a global by the XLS extension

// Runs the Initializer, once per page.
let viewerRuntime;
function initViewerRuntime() {
  viewerRuntime ??= (async () => {
    if (!window.isSecureContext) {
      throw new Error('The viewer requires HTTPS (or http://localhost).');
    }
    await new Promise(resolve => Autodesk.Viewing.Initializer({ env: 'AutodeskProduction2', api: 'streamingV2', getAccessToken: getApsToken }, resolve));
  })();
  viewerRuntime.catch(() => { viewerRuntime = null; });
  return viewerRuntime;
}

// Loads the model into a fresh viewer, replacing any previous one.
async function launchViewer(urn, name) {
  fileName = name;
  if (viewer) {
    viewer.finish();
    viewer = null;
  }
  document.getElementById('apsViewer').replaceChildren();

  try {
    await initViewerRuntime();
  } catch (err) {
    console.error(err);
    setText('viewerMessage', err.message, true);
    return;
  }

  viewer = new Autodesk.Viewing.GuiViewer3D(document.getElementById('apsViewer'));
  viewer.start();
  Autodesk.Viewing.Document.load('urn:' + urn, onDocumentLoadSuccess, onDocumentLoadFailure);
}

function onDocumentLoadSuccess(doc) {
  viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry())
    .then(() => document.dispatchEvent(new CustomEvent('viewerinstance', { detail: { viewer } })))
    .catch(err => console.error('loadDocumentNode() failed:', err));
}

function onDocumentLoadFailure(viewerErrorCode) {
  console.error('onDocumentLoadFailure() - errorCode:' + viewerErrorCode);
}

async function getApsToken(callback) {
  try {
    const res = await fetch('/api/auth/token');
    if (!res.ok) throw new Error(res.statusText);
    const { access_token, expires_in } = await res.json();
    callback(access_token, expires_in);
  } catch (err) {
    console.error('Could not get access token:', err);
  }
}
