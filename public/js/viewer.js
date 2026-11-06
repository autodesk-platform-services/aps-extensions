/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by APS Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

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
