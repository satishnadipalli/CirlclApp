const express = require('express')
const router = express.Router()
const auth = require('../middlewares/auth.middleware')
const { createReport } = require('../controllers/safety.controllers')

router.post('/report', auth, createReport)

module.exports = router