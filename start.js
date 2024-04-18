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

const path = require('path');
const express = require('express');
const fs = require('fs');
const { PORT } = require('./config.js');

let masterconfigpath = './public/extensions/config.json';
let extensionsconfig = require(masterconfigpath);
let source = './public/extensions';
let extensions = [];
fs.readdirSync(source, { withFileTypes: true })
.filter(dirent => dirent.isDirectory())
.forEach(folder => {
    let econfig = require(source+'/'+folder.name+'/config.json')
    extensions.push(econfig);
});
extensionsconfig.Extensions = extensions;
fs.writeFileSync(masterconfigpath, JSON.stringify(extensionsconfig), function(err) {
    if (err) throw err;
});

let app = express();
app.use(express.static('public'));
app.use(require('./routes/auth.js'));
app.use(require('./routes/models.js'));
app.listen(PORT, function () { console.log(`Server listening on port ${PORT}...`); });
