const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const cp = require('child_process');
const os = require('os');
const ytdlc = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const internal = require('stream');

const ytdl = os.platform() == 'win32' ? 'youtube-dl' : 'yt-dlp'

const downloading = new Set();

app.use((req, res, next) => {
    if ([...downloading.values()].some(a => req.path.includes(a))) {
        return res.send('Still downloading file, please wait...');
    }

    next();
});
app.use(express.static('files'));

app.get('/vid/:file', (req, res) => {
    if (!fs.existsSync(`./files/${req.params.file}`))
        return res.status(404).send(`Cannot GET /vid/${req.params.file}`);

    console.log(req.originalUrl);
    res.send(fs.readFileSync('./files/__template.html').toString()
        .replace(/{vid_url}/g, `${req.protocol}://${req.get('host')}${req.originalUrl.replace(/\/vid\//, '/')}`)
        .replace(/{file_name}/g, req.params.file)
        .replace(/{ext_name}/g, path.extname(req.params.file).replace(/\./g, ''))
    );
});

app.listen(80, () => {
    console.log(`Listening`);
});

app.get('/ytd', (_, res) => {
    res.send(fs.readFileSync('./yt-downloader.html', 'utf8'));
});

// This probably has some kind of unsanitized input but I can't care enough due to it being Dockerized pffft
app.get('/api/yt-download', async (req, res) => {
    // Formats: mp4, mp3, flac, aac

    try {
        const url = new URL(req.query.url);
        const format = !req.query.format ? 'mp3' : req.query.format;
        const redirects = (req.query.redirects && req.query.redirects == 'true') ?? true;

        if (url.hostname !== 'www.youtube.com' && url.hostname !== 'youtube.com')
            return res.status(400).send('Invalid URL');

        if (!url.searchParams.has('v'))
            return res.status(400).send('Invalid URL');

        const id = url.searchParams.get('v');

        const info = await ytdlc.getInfo(req.query.url);

        if (parseInt(info.videoDetails.lengthSeconds) > 60 * 60 * 5)
            return res.status(400).send('Video is too long (max 5 hours)');

        const filename = `${info.videoDetails.title.replace(/[/\\?%*:|"<>]/g, '-')} [${id}].${format}`;

        if (fs.existsSync(`./files/${filename}`)) {
            if (redirects)
                res.redirect(`/${filename}`);
            else
                res.send(`/${filename}`);

            return;
        }

        if (['mp3', 'flac', 'aac', 'mkv'].some(a => a == format)) {
            /*const download = cp.exec(`${ytdl} -x --audio-format ${format} -o - ${req.query.url}`, (err, stdout, stderr) => {
                if (err) {
                    console.error(err);
                    downloading.delete(`${filename}`);

                    return res.status(500).send(err);
                }
            });

            downloading.add(`${filename}`);

            download.once('close', () => {
                if (!req.destroyed)
                    if (redirects)
                        res.redirect(`/${filename}`);
                    else
                        res.send(`/${filename}`);

                downloading.delete(filename);

                setTimeout(() => {
                    console.log(`Deleting ${filename}, time has already passed 24h.`);
                    fs.rmSync(`./files/${filename}`);
                }, 6 * 60 * 60 * 1000); // Automatically delete after 6 hours
            });*/

            res.setHeader('filename', filename);

            const audio = ytdlc(req.query.url, { quality: 'highestaudio' });
            
            res.setHeader('Transfer-Encoding', 'chunked');

            if (format == 'mkv') {
                res.setHeader('Content-Type', `video/${format}`);

                const conv = ffmpeg()
                    .addInput(audio)
                    .addInput(ytdlc.chooseFormat(info.formats, { quality: 'highestvideo', filter: a => a.container == 'mp4' }).url)
                    .withVideoCodec('copy')
                    .format('matroska');

                conv.on('stderr', data => {
                    console.log(data);
                });

                conv.once('error', err => {
                    console.error(`An error occurred with ${format}, ${filename}: `, err);
                });

                req.once('close', () => { // In case some dude decides to screw me over or something.
                    conv.kill();
                });

                conv.pipe(res);
            } else {
                res.setHeader('Content-Type', `audio/${format}`);

                const conv = ffmpeg()
                    .addInput(audio)
                    .format(format);

                conv.on('stderr', data => {
                    console.log(data);
                });

                conv.once('error', err => {
                    console.error(`An error occurred with ${format}, ${filename}: `, err);
                });

                req.once('close', () => { // In case some dude decides to screw me over or something.
                    console.log('Bro some dude just closed the stream');
                    conv.kill();
                });

                conv.noVideo().pipe(res);
            }
        } else {
            return res.status(400).send('Invalid format');
        }
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});