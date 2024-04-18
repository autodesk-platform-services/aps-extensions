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

const express = require('express');
const formidable = require('express-formidable');
const { listBuckets, listObjects, uploadObject, translateObject, getManifest, urnify } = require('../services/aps.js');

let router = express.Router();

router.get('/api/models/buckets', async function (req, res, next) {
    try {
        const bucket_name = req.query.id;
        if (!bucket_name || bucket_name === '#') {
            const buckets = await listBuckets();
            res.json(buckets.map((bucket) => {
                return {
                    id: bucket.bucketKey,
                    text: bucket.bucketKey,
                    type: 'bucket',
                    children: true
                };
            }));
            
        } else {
            const objects = await listObjects(bucket_name);
            res.json(objects.map((object) => {
                return {
                    id: Buffer.from(object.objectId).toString('base64'),
                    text: object.objectKey,
                    type: 'object',
                    children: false
                };
            }));
        }
    } catch (err) {
        next(err);
    }
});

router.post('/api/models/upload', formidable({ maxFileSize: Infinity }), async function (req, res, next) {
    const file = req.files.fileToUpload;
    if (!file) {
        res.status(400).send('The required field ("model-file") is missing.');
        return;
    }
    try {
        const obj = await uploadObject(file.name, file.path, req.fields.bucketKey);
        await translateObject(urnify(obj.objectId), req.fields['model-zip-entrypoint']);
        res.json({
            name: obj.objectKey,
            urn: urnify(obj.objectId)
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
