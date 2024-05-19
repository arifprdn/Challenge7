require('dotenv').config();
const bodyParser = require('body-parser');
let { google } = require('googleapis')
let nodemailer = require('nodemailer')
const { JWT_SECRET_KEY, REFRESH_TOKEN, CLIENT_ID, CLIENT_SECRET, EMAIL_SENDER } = process.env;
const jwt = require('jsonwebtoken');
const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();
const restrict = require('./middlewares/restrict.js')
const Sentry = require('./libs/sentry')
const express = require('express')
const app = express()
const port = 3000
const cors = require('cors');
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path')

app.use(express.static(path.join(__dirname, 'public')))
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());
app.use(cors())
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json())

app.set('view engine', 'ejs')

const v1 = require('./router/v1/index.js')
app.use('/v1', v1)

let oauth2Client = new google.auth.OAuth2(
    CLIENT_ID, CLIENT_SECRET
)

oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN })

async function sendEmail(email, subject, text) {
    try {
        let accessToken = await oauth2Client.getAccessToken()
        let transport = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: EMAIL_SENDER,
                clientId: CLIENT_ID,
                clientSecret: CLIENT_SECRET,
                refreshToken: REFRESH_TOKEN,
                accessToken: accessToken
            }
        })

        transport.sendMail({
            to: email,
            subject: subject,
            text: text
        })

    } catch (err) {
        console.log(err)
    }
}

const generateResetPasswordToken = (email) => {
    const payload = {
        email: email,
        exp: Math.floor(Date.now() / 1000) + (60 * 60),
    };
    const token = jwt.sign(payload, JWT_SECRET_KEY);

    return token;
};

app.get('/', (req, res) => {
    res.json({
        status: true,
        message: 'Hello!!, please use V1 Router !',
        data: null
    })
})

app.get('/v1/resetpassword', async (req, res, next) => {
    try {
        const token = req.query.token;
        if (!token) {
            return res.status(400).json({
                status: false,
                message: 'Token Invalid',
                data: null
            })
        }

        jwt.verify(token, JWT_SECRET_KEY, (err, decoded) => {
            if (err) {
                return res.status(401).json({
                    status: false,
                    message: `Token Invalid`,
                    data: null
                })
            }
            req.user = decoded
        })

        let user = await prisma.user.findUnique({ where: { email: req.user.email } })

        res.render('resetpassword', { name: user.name, email: user.email })

    } catch (error) {
        next(error)
    }
})

app.post('/v1/resetpassword', async (req, res, next) => {
    try {
        const email = req.body.email
        const user = await prisma.user.findUnique({ where: { email } })

        if (!user) {
            return res.status(400).json({
                status: false,
                message: 'Account doesnt exist, please register first',
                data: null
            })
        }

        const updatedUser = await prisma.user.update({
            where: { email },
            data: { password: req.body.password }
        });

        const ChangedPasswordNotif = await prisma.notification.create({
            data: {
                title: 'Reset Password',
                message: `${updatedUser.name}, Your Password Changed Successfully !`,
                userId: updatedUser.id
            }
        })

        io.emit(`user-${updatedUser.id}`, ChangedPasswordNotif.message);

        res.status(200).json({
            status: 'OK',
            message: 'Password Changed!',
            data: null
        })

    } catch (error) {
        next(error)
    }
})

app.get('/v1/forgotpassword', (req, res) => {
    res.render('forgotpassword')
})

app.post('/v1/forgotpassword', async (req, res, next) => {
    try {
        let email = await prisma.user.findUnique({ where: { email: req.body.email } })
        if (!email) {
            return res.status(400).json({
                status: false,
                message: 'Account doesnt exist, please register first',
                data: null
            })
        }
        token = generateResetPasswordToken(req.body.email)
        url = `${req.protocol}://${req.get('host')}/v1/resetpassword?token=${token}`
        sendEmail(req.body.email, 'RESET PASSWORD', 'LINK RESET PASSWORD : ' + url)

        res.status(200).json({
            status: 'OK',
            message: 'RESET PASSWORD LINK WAS SENT',
            data: null
        })

    } catch (error) {
        next(error)
    }
})

app.post('/v1/register', async (req, res, next) => {
    try {
        let email = await prisma.user.findUnique({ where: { email: req.body.email } })
        if (email) {
            return res.status(400).json({
                status: false,
                message: 'Email already used!',
                data: null
            })
        }
        if (!req.body.name || !req.body.email || !req.body.password) {
            return res.status(400).json({
                status: false,
                message: 'field cannot empty!',
                data: null
            })
        }
        const newUser = await prisma.user.create({
            data: {
                name: req.body.name,
                email: req.body.email,
                password: req.body.password,
            }
        });

        const newNotif = await prisma.notification.create({
            data: {
                title: 'Registration Success',
                message: `Welcome ${newUser.name}, this is your first notification !`,
                userId: newUser.id
            }
        })

        io.emit(`user-${newUser.id}`, newNotif.message);

        res.status(201).json({
            status: 'true',
            message: 'ok',
            data: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email
            }
        })

    } catch (err) {
        next(err)
    }
})


io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        console.log(`Starting http://localhost:${port}`);
    });
}

app.use(Sentry.Handlers.errorHandler());


// 500 error handler
app.use((err, req, res, next) => {
    console.log(err);
    res.status(500).json({
        status: false,
        message: err.message,
        data: null
    });
});

// 404 error handler
app.use((req, res, next) => {
    res.status(404).json({
        status: false,
        message: `are you lost? ${req.method} ${req.url} is not registered!`,
        data: null
    });
});


module.exports = app