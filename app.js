const express = require('express')
const http = require('http')
var cors = require('cors')
const app = express()
const bodyParser = require('body-parser')
const path = require("path")
var xss = require("xss")

var server = http.createServer(app)
var io = require('socket.io')(server)

app.use(cors())
app.use(bodyParser.json())

if(process.env.NODE_ENV==='production'){
	app.use(express.static(__dirname+"/build"))
	app.get("*", (req, res) => {
		res.sendFile(path.join(__dirname+"/build/index.html"))
	})
}
app.set('port', (process.env.PORT || 4001))

sanitizeString = (str) => {
	return xss(str)
}

connections = {}
messages = {}
timeOnline = {}

io.on('connection', (socket) => {

	socket.on('join-call', ({path,userId,userName}) => {

		console.log("join-callF",path);

		if(connections[path] === undefined){
			connections[path] = []
		}
		
		console.log("socket.id",socket.id,"userId:",userId,"userName:",userName);
		connections[path].push({userId, userName})

		timeOnline[socket.id] = new Date()

		for(let a = 0; a < connections[path].length; ++a){			
			let informUserId = connections[path][a]["userId"];
			console.log("connections[path][a]",connections[path][a],"informUserId:",informUserId);
			io.to(informUserId).emit("user-joined", socket.id, connections[path])
		}

		if(messages[path] !== undefined){
			for(let a = 0; a < messages[path].length; ++a){
				console.log("messages[path][a]['data']",messages[path][a]['data']);
				console.log("messages[path][a]['sender']:",messages[path][a]['sender']);
				console.log("messages[path][a]['socket-id-sender']:",messages[path][a]['socket-id-sender']);

				io.to(socket.id).emit("chat-message", messages[path][a]['data'], 
					messages[path][a]['sender'], messages[path][a]['socket-id-sender'])
			}
		}

		// console.log(path, connections[path])
	})

	socket.on('signal', (toId, message) => {
		console.log("signalF",{toId, message});

		io.to(toId).emit('signal', socket.id, message)
	})

	socket.on('chat-message', (data, sender) => {
		data = sanitizeString(data)
		sender = sanitizeString(sender)

		console.log("chat-message:",data,sender);

		var key
		var ok = false
		for (const [k, v] of Object.entries(connections)) {
			console.log("v:",v);
			for(let a = 0; a < v.length; ++a){
				console.log("v[a]:",v[a]);
				if(v[a]["userId"] === socket.id){
					key = k
					ok = true
				}
			}
		}
		
		console.log("final K :",key);

		if(ok === true){
			if(messages[key] === undefined){
				messages[key] = []
			}
			messages[key].push({"sender": sender, "data": data, "socket-id-sender": socket.id})
			console.log("message", key, ":", sender, data)

			for(let a = 0; a < connections[key].length; ++a){
				console.log("connections[key][a]:",connections[key][a]);
				io.to(connections[key][a]["userId"]).emit("chat-message", data, sender, socket.id)
			}
		}
	})

	socket.on('disconnect', () => {
		console.log("disconnectF");
		var diffTime = Math.abs(timeOnline[socket.id] - new Date())
		var key
		for (const [k, v] of JSON.parse(JSON.stringify(Object.entries(connections)))) {
			for(let a = 0; a < v.length; ++a){
				if(v[a] === socket.id){
					key = k

					for(let a = 0; a < connections[key].length; ++a){
						io.to(connections[key][a]).emit("user-left", socket.id)
					}
			
					var index = connections[key].indexOf(socket.id)
					connections[key].splice(index, 1)

					console.log(key, socket.id, Math.ceil(diffTime / 1000))

					if(connections[key].length === 0){
						delete connections[key]
					}
				}
			}
		}
	})
})

server.listen(app.get('port'), () => {
	console.log("listening on", app.get('port'))
})