const express = require('express')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
const dbPath = path.join(__dirname, 'twitterClone.db')
app.use(express.json())
let db

//initializing db and server
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is Running...')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

//middleware
const authenticateUser = async (request, response, next) => {
  const authBody = request.headers['authorization']
  if (authBody !== undefined) {
    const userToken = authBody.split(' ')[1]
    jwt.verify(userToken, 'sairamakrishna', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.user_id = payload.user_id
        next()
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}

//API 1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const isUserExistQuery = `
    SELECT 
        *
    FROM
        user
    WHERE
        username = '${username}'; `
  const hashedPassword = await bcrypt.hash(password, 10)
  const createUserQuery = `
    INSERT INTO user(username, password, name, gender) VALUES ('${username}', '${hashedPassword}', '${name}', '${gender}'); `
  const isUserExist = await db.get(isUserExistQuery)
  console.log(isUserExist)
  if (isUserExist === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const createUserResponse = await db.run(createUserQuery)
      response.send('User created successfully')
      const {lastID} = createUserResponse
      console.log(lastID)
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const isUserExistQuery = `
    SELECT 
        *
    FROM
        user
    WHERE
        username = '${username}'; `
  const isUserExist = await db.get(isUserExistQuery)
  if (isUserExist !== undefined) {
    const validatePassword = await bcrypt.compare(
      password,
      isUserExist.password,
    )
    if (validatePassword) {
      const payload = {username: username, user_id: isUserExist.user_id}
      const jwtToken = await jwt.sign(payload, 'sairamakrishna')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

//API 3
app.get('/user/tweets/feed/', authenticateUser, async (request, response) => {
  const {user_id} = request
  const getUserfeedQuery = `
  SELECT
    user.username, tweet.tweet, tweet.date_time as dateTime
  FROM  follower
    LEFT JOIN user on follower.following_user_id = user.user_id
    LEFT JOIN tweet on user.user_id = tweet.user_id
  WHERE
    follower.follower_user_id = ${user_id}
  ORDER BY 
    tweet.date_time DESC
  LIMIT 4;`
  const userFeed = await db.all(getUserfeedQuery)
  response.send(userFeed)
})

//API 4
app.get('/user/following/', authenticateUser, async (request, response) => {
  const {user_id} = request
  console.log(user_id)
  const getUserFollowingQuery = `
  SELECT 
    user.name
  FROM follower
  INNER JOIN  user on follower.following_user_id = user.user_id 
  WHERE
    follower.follower_user_id = ${user_id}; `
  const userFollowing = await db.all(getUserFollowingQuery)
  response.send(userFollowing)
})

//API 5
app.get('/user/followers/', authenticateUser, async (request, response) => {
  const {user_id} = request
  const getUserFollowersQuery = `
  SELECT 
    user.name
  FROM follower
    INNER JOIN user on user.user_id = follower.follower_user_id
  WHERE
    follower.following_user_id = ${user_id}; `
  const userFollowers = await db.all(getUserFollowersQuery)
  response.send(userFollowers)
})

//API 6
app.get('/tweets/:tweetId/', authenticateUser, async (request, response) => {
  const {tweetId} = request.params
  const {user_id} = request
  console.log(user_id)
  const getUserFollowingQuery = `
  SELECT 
    following_user_id
  FROM follower
  WHERE
    follower_user_id = ${user_id}; `
  const getTweetedUserIdQuery = `
  SELECT
    user_id
  FROM 
    tweet
  WHERE
    tweet_id = ${tweetId}; `
  const getTweetDetailsQuery = `
  SELECT tweet.tweet, count(DISTINCT like.like_id) as likes,  count(distinct reply.reply_id) as replies, tweet.date_time as dateTime  FROM tweet left join like on tweet.tweet_id = like.tweet_id left join reply on tweet.tweet_id = reply.tweet_id where tweet.tweet_id = ${tweetId} ;  `
  const userFollowing = await db.all(getUserFollowingQuery)
  console.log(userFollowing)
  const tweetUserId = await db.get(getTweetedUserIdQuery)
  console.log(tweetUserId)
  const followingArray = userFollowing.map(eachObj => eachObj.following_user_id)
  console.log(followingArray)
  const isFollowing = followingArray.includes(tweetUserId.user_id)
  console.log(isFollowing)
  if (isFollowing) {
    const tweetDetails = await db.all(getTweetDetailsQuery)
    response.send(tweetDetails)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateUser,
  async (request, response) => {
    const {tweetId} = request.params
    const {user_id} = request
    console.log(user_id)
    const getUserFollowingQuery = `
  SELECT 
    following_user_id
  FROM follower
  WHERE
    follower_user_id = ${user_id}; `
    const getTweetedUserIdQuery = `
  SELECT
    user_id
  FROM 
    tweet
  WHERE
    tweet_id = ${tweetId}; `
    const getLikedUsersQuery = `
  SELECT user.username 
  FROM tweet 
    LEFT JOIN like on tweet.tweet_id = like.tweet_id 
    LEFT JOIN user on like.user_id = user.user_id 
  WHERE 
    tweet.tweet_id = ${tweetId}; `
    const userFollowing = await db.all(getUserFollowingQuery)
    console.log(userFollowing)
    const tweetUserId = await db.get(getTweetedUserIdQuery)
    console.log(tweetUserId)
    const followingArray = userFollowing.map(
      eachObj => eachObj.following_user_id,
    )
    console.log(followingArray)
    const isFollowing = followingArray.includes(tweetUserId.user_id)
    console.log(isFollowing)
    if (isFollowing) {
      const likedUsers = await db.all(getLikedUsersQuery)
      const likedUsersList = likedUsers.map(eachObj => eachObj.username)
      response.send({likes: likedUsersList})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateUser,
  async (request, response) => {
    const {tweetId} = request.params
    const {user_id} = request
    console.log(user_id)
    const getUserFollowingQuery = `
  SELECT 
    following_user_id
  FROM follower
  WHERE
    follower_user_id = ${user_id}; `
    const getTweetedUserIdQuery = `
  SELECT
    user_id
  FROM 
    tweet
  WHERE
    tweet_id = ${tweetId}; `
    const getrepliedUsersQuery = `
  SELECT user.name, reply.reply
  FROM tweet 
    LEFT JOIN reply on tweet.tweet_id = reply.tweet_id 
    LEFT JOIN user on reply.user_id = user.user_id 
  WHERE 
    tweet.tweet_id = ${tweetId}; `
    const userFollowing = await db.all(getUserFollowingQuery)
    console.log(userFollowing)
    const tweetUserId = await db.get(getTweetedUserIdQuery)
    console.log(tweetUserId)
    const followingArray = userFollowing.map(
      eachObj => eachObj.following_user_id,
    )
    console.log(followingArray)
    const isFollowing = followingArray.includes(tweetUserId.user_id)
    console.log(isFollowing)
    if (isFollowing) {
      const repliedUsers = await db.all(getrepliedUsersQuery)
      response.send({replies: repliedUsers})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 9
app.get('/user/tweets/', authenticateUser, async (request, response) => {
  const {user_id} = request
  const getUserTweetsQuery = `
    SELECT tweet.tweet, count(DISTINCT like.like_id) as likes,  count(distinct reply.reply_id) as replies, tweet.date_time as dateTime  FROM tweet left join like on tweet.tweet_id = like.tweet_id left join reply on tweet.tweet_id = reply.tweet_id where tweet.user_id = ${user_id} GROUP BY tweet.tweet_id ;  `
  const userTweets = await db.all(getUserTweetsQuery)
  response.send(userTweets)
})

//API 10
app.post('/user/tweets/', authenticateUser, async (request, response) => {
  const {tweet} = request.body
  const {user_id} = request
  const postTweetQuery = `
  INSERT INTO tweet (tweet, user_id, date_time)
  VALUES
    ('${tweet}', ${user_id}, '${new Date()}'); `
  const postTweet = await db.run(postTweetQuery)
  console.log(postTweet.lastID)
  response.send('Created a Tweet')
})

//API 11
app.delete('/tweets/:tweetId/', authenticateUser, async (request, response) => {
  const {tweetId} = request.params
  const {user_id} = request
  const deleteTweetQuery = `
  DELETE FROM tweet WHERE tweet_id = ${tweetId}; `
  const getTweetUserIdQuery = ` 
  SELECT user_id 
  FROM 
    tweet
  WHERE
    tweet_id = ${tweetId}; `
  const tweetUserId = await db.get(getTweetUserIdQuery)
  console.log('got tweetUserId')
  if (tweetUserId.user_id === user_id) {
    await db.run(deleteTweetQuery)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
