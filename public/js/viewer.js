let viewer;
var fileName; // Read as a global by the XLS extension

// Loads the model into a fresh viewer, replacing any previous one.
function launchViewer(urn, name) {
  fileName = name;
  if (viewer) {
    viewer.finish();
    viewer = null;
  }
  document.getElementById('apsViewer').replaceChildren();

  Autodesk.Viewing.Initializer({ env: 'AutodeskProduction', getAccessToken: getApsToken }, () => {
    viewer = new Autodesk.Viewing.GuiViewer3D(document.getElementById('apsViewer'));
    viewer.start(null, null, null, null, {
      webglInitParams: {
        useWebGL2: false // Needed by the Potree extension. If this causes problems, use viewer.start() instead.
      }
    });
    Autodesk.Viewing.Document.load('urn:' + urn, onDocumentLoadSuccess, onDocumentLoadFailure);
  });
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
