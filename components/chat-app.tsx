'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import io from 'socket.io-client'

// Initialize Firebase (replace with your config)
const firebaseConfig = {
  // Your Firebase configuration
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

// Initialize Socket.IO
const socket = io('http://localhost:3001')

export function ChatAppComponent() {
  const [user, setUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState('en')
  const messagesEndRef = useRef(null)

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUser(user)
        // Join the chat room
        socket.emit('join', { userId: user.uid, language: preferredLanguage })
      } else {
        setUser(null)
      }
    })

    // Listen for new messages
    socket.on('message', (message) => {
      setMessages((prevMessages) => [...prevMessages, message])
    })

    // Fetch initial messages
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'desc'), limit(50))
    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setMessages(fetchedMessages.reverse())
    })

    return () => {
      unsubscribe()
      unsubscribeMessages()
      socket.off('message')
    }
  }, [preferredLanguage])

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const signIn = async () => {
    const provider = new GoogleAuthProvider()
    try {
      await signInWithPopup(auth, provider)
    } catch (error) {
      console.error('Error signing in with Google', error)
    }
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (inputMessage.trim() && user) {
      const newMessage = {
        text: inputMessage,
        userId: user.uid,
        username: user.displayName,
        timestamp: new Date(),
        originalLanguage: 'auto', // We'll detect this on the server
      }

      // Add message to Firestore
      await addDoc(collection(db, 'messages'), newMessage)

      // Emit the message to the server for translation and broadcasting
      socket.emit('sendMessage', { ...newMessage, targetLanguage: preferredLanguage })

      setInputMessage('')
    }
  }

  if (!user) {
    return (
      <Card className="w-full max-w-md mx-auto mt-10">
        <CardHeader>
          <CardTitle>Welcome to TranslateChat</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={signIn}>Sign in with Google</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-2xl mx-auto mt-10">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>TranslateChat</span>
          <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="fr">French</SelectItem>
              <SelectItem value="de">German</SelectItem>
              <SelectItem value="zh">Chinese</SelectItem>
            </SelectContent>
          </Select>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-96 overflow-y-auto mb-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.userId === user.uid ? 'justify-end' : 'justify-start'} mb-2`}>
              <div className={`flex items-start ${message.userId === user.uid ? 'flex-row-reverse' : ''}`}>
                <Avatar className="w-8 h-8 mr-2">
                  <AvatarImage src={message.userId === user.uid ? user.photoURL : ''} />
                  <AvatarFallback>{message.username[0]}</AvatarFallback>
                </Avatar>
                <div className={`rounded-lg p-2 max-w-xs ${message.userId === user.uid ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>
                  <p className="text-sm">{message.text}</p>
                  {message.translatedText && (
                    <p className="text-xs mt-1 italic">{message.translatedText}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </CardContent>
      <CardFooter>
        <form onSubmit={sendMessage} className="flex w-full">
          <Input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-grow mr-2"
          />
          <Button type="submit">Send</Button>
        </form>
      </CardFooter>
    </Card>
  )
}