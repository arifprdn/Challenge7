const { JWT_SECRET_KEY } = process.env;
const jwt = require('jsonwebtoken');
const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient();



function welcome(req, res) {
    res.json({
        status: true,
        message: 'Selamat datang di web!',
        data: null
    })
}

module.exports = {
    welcome,
    create: async (req, res, next) => {
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

            //req.io.emit(`user-${newUser.id}`, newNotif.message);

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
    },
    login: async (req, res, next) => {
        try {

            let { email, password } = req.body
            let user = await prisma.user.findUnique({ where: { email } })
            if (!user) {
                return res.status(400).json({
                    status: "Bad Request",
                    message: `invalid email or password`,
                    data: null
                })
            }

            if (password != user.password) {
                return res.status(400).json({
                    status: "Bad Request",
                    message: `invalid email or password`,
                    data: null
                })
            }

            let token = jwt.sign(user, JWT_SECRET_KEY)
            return res.status(200).json({
                status: true,
                message: `Login Success`,
                data: {
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email

                    }, token
                }
            });
        }
        catch (err) {
            next(err)
        }

    },
    notification: async (req, res, next) => {
        try {
            let userId = req.user.id
            let { name } = req.user
            let notification = await prisma.notification.findMany({ where: { userId } })

            let notifications = notification.filter(n => {
                return n.userId == userId;
            });

            res.render('notification', { userID: userId, notifications, name });

        }
        catch (err) {
            next(err)
        }

    }
}