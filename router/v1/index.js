const router = require('express').Router()
const userController = require('../../controllers/v1/userController')
const restrict = require('../../middlewares/restrict')


router.get('/', userController.welcome)
//router.post('/register', userController.create)
router.post('/login', userController.login)


router.get('/notification', restrict, userController.notification)


module.exports = router