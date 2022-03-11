const express = require('express');
const router = express.Router();
const fs = require('fs');
const bodyParser = require('body-parser');

let currentPronouns = require('./files/pronouns.json');

return;
router.use(bodyParser.json());
router.get('/list', (req, res) => {
    res.send(currentPronouns);
});

router.post('/update', (req, res) => {
    if (!req.body.username) {
        res.status(400).send({ status: 400, message: 'No username' });
        return;
    }

    if (!req.body.pronouns) {
        res.status(400).send({ status: 400, message: 'No pronouns' });
        return;
    }

    currentPronouns[req.body.username] = req.body.pronouns;
    fs.writeFileSync(`./files/pronouns.json`, JSON.stringify(currentPronouns, null, 4));

    res.sendStatus(204);
});

// Quarterly backups of the pronouns system, to make sure no one ends up deciding to casually break something
setInterval(() => {
    fs.writeFileSync(`./files/pronouns-${Date.now()}.json.backup`, JSON.stringify(currentPronouns, null, 4));
}, 6 * 60 * 60 * 1000);

module.exports = router;
