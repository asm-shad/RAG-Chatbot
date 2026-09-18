"use client"

import { useEffect } from "react"

const Background = () => {
  useEffect(() => {
    const backgrounds = [
      "/backgroun1.jpg",
      "/backgroun2.jpg",
      "/backgroun3.jpg",
    ]

    const randomBackground =
      backgrounds[Math.floor(Math.random() * backgrounds.length)]

    document.body.style.setProperty(
      "--background-image",
      `url("${randomBackground}")`
    )
  }, [])

  return null
}

export default Background