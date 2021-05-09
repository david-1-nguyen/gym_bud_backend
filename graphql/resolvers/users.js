require('dotenv').config()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const {UserInputError} = require('apollo-server')
const sgMail = require('@sendgrid/mail')

const SECRET_KEY = process.env.SECRET_KEY
const EMAIL_KEY = process.env.EMAIL_VER_KEY
const EMAIL_SECRET = process.env.EMAIL_SECRET

const User = require('../models/User')
sgMail.setApiKey(EMAIL_KEY)

const {validateRegisterInput, validateLoginInput} = require('../../utils/validators')


function getToken(user) {
    return jwt.sign({
        id: user.id,
        email: user.email,
        username: user.username
    }, SECRET_KEY, {expiresIn: '1hr'});
}

function getEmailToken(username) {
    return jwt.sign({
        username: username,
    }, EMAIL_SECRET, {expiresIn: '1d'});
}

module.exports = {
    Query: {
        /* a resolver to return all users in mongodb
        * NoInput -> Array of Users */
        async getUsers() {
            try {
                return await User.find()
            } catch (err) {
                throw new Error(err)
            }
        },
        /* a resolver to return a user object given username
        *  a username (String)
        *  String ->  User
        * */
        async getAUser(_, {username}) {
            try {
                return await User.findOne({username})

            } catch (err) {
                throw new UserInputError('User not found')
            }
        },

    }
    ,
    Mutation: {
        /* resolver to login for Users
        * username(string), password(string) -> User object with id and token
        * features: checks userinput, checks if user exists, checks if credentials are correct, and checks user token */
        async login(_, {username, password}) {
            const {errors, valid} = validateLoginInput(username, password)
            const user = await User.findOne({username})

            if (!valid) {
                throw new UserInputError('Errors', {errors})
            }
            if (!user) {
                errors.general = 'User not found'
                throw new UserInputError('User not found', {errors})
            }
            const match = await bcrypt.compare(password, user.password)

            if (!match) {
                errors.general = 'Wrong credentials'
                throw new UserInputError('Wrong credentials', {errors})
            }

            const token = getToken(user)
            return {
                ...user._doc,
                id: user._id,
                token
            }


        },
        /* a mutation that creates a new user object in database
        * username(string), email(string), pass(string), confirmPassword(string), Phone Number(string) ->
        * user object called register that has all values above with mongodb ID, jwt token
        * features: user input validation, password encryption, 1 hr jwt token */
        async register(_, {registerInput: {username, email, password, confirmPassword, phonenumber}}, {req}) {
            const user = await User.findOne({username})
            if (user) {
                throw new UserInputError('Username is taken', {
                    errors: {
                        username: 'This username is taken'
                    }
                })
            }
            const {errors, valid} = validateRegisterInput(username, email, password, confirmPassword)

            if (!valid) {
                throw new UserInputError('Errors', {errors})
            }

            if (password)
                password = await bcrypt.hash(password, 12)

            const emailToken = getEmailToken(username)

            const newUser = new User({
                email: email,
                username: username,
                password: password,
                createdAt: new Date().toISOString(),
                admin: false,
                phonenumber: phonenumber,
                emailToken: emailToken
            })

            const res = await newUser.save()

            const token = getToken(res)

            // sending verification email
            const msg = {
                to: email, // Change to your recipient
                from: 'gymbud_admin@zohomail.com', // Change to your verified sender
                subject: 'Email Verification for Gym Bud!',
                text: `Click the link below to verify your Calpoly email address!
                        link: http://${req.headers.host}/verify?token=${emailToken}`,
                html: '<strong>and easy to do anywhere, even with Node.js</strong>' +
                    `<a href="http://${req.headers.host}/verify?token=${emailToken}">Verify</a>`,
            }

            await sgMail
                .send(msg)
                .then(() => {
                    console.log('Email sent')
                })
                .catch((error) => {
                    console.error(error)
                })
            console.log(msg.text)

            return {
                ...res._doc,
                id: res._id,
                token
            }
        },
        async setExtraUserFields(_, {
            extraFields: {
                username,
                timeAvailability,
                gymName,
                genderPreference,
                goalPreference,
                frequencyPreference
            }
        }) {
            const user = await User.findOne({username})
            if (!user) {
                throw new UserInputError('User not found')
            }
            try {
                return await User.updateOne({username}, {
                    timeAvailability: timeAvailability,
                    gymName: gymName,
                    genderPreference: genderPreference,
                    goalPreference: goalPreference,
                    frequencyPreference: frequencyPreference
                })
            } catch (err) {
                throw new Error(err)
            }
        }
    }
}
