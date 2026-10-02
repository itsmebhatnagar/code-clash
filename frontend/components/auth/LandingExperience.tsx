'use client'

import { useEffect, useRef } from 'react'
import { ArrowDown, ArrowRight } from 'lucide-react'

export function LandingExperience({ onEnter }: { onEnter: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const desiredFrameRef = useRef(0)

  useEffect(() => {
    const stage = stageRef.current
    const video = videoRef.current
    if (!stage || !video || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    const updateFrame = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const distance = stage.offsetHeight - window.innerHeight
        const progress = distance > 0 ? Math.min(1, Math.max(0, -stage.getBoundingClientRect().top / distance)) : 0
        stage.style.setProperty('--scroll-progress', String(progress))
        if (Number.isFinite(video.duration) && video.duration > 0) {
          const totalFrames = Math.max(1, Math.round(video.duration * 24))
          desiredFrameRef.current = Math.min(totalFrames - 1, Math.round(progress * (totalFrames - 1)))
          const currentFrame = Math.round(video.currentTime * 24)
          if (!video.seeking && currentFrame !== desiredFrameRef.current) {
            video.currentTime = desiredFrameRef.current / 24
          }
        }
      })
    }

    if (video.readyState >= 1) {
      updateFrame()
    }

    video.addEventListener('loadedmetadata', updateFrame)
    video.addEventListener('loadeddata', updateFrame)
    video.addEventListener('canplay', updateFrame)
    video.addEventListener('seeked', updateFrame)
    window.addEventListener('scroll', updateFrame, { passive: true })
    window.addEventListener('resize', updateFrame)
    return () => {
      cancelAnimationFrame(frame)
      video.removeEventListener('loadedmetadata', updateFrame)
      video.removeEventListener('loadeddata', updateFrame)
      video.removeEventListener('canplay', updateFrame)
      video.removeEventListener('seeked', updateFrame)
      window.removeEventListener('scroll', updateFrame)
      window.removeEventListener('resize', updateFrame)
    }
  }, [])

  return <main className="echona-landing">
    <div className="echona-scroll-stage" id="home" ref={stageRef}>
      <section className="echona-hero" aria-labelledby="echona-title">
        <video className="echona-scene" ref={videoRef} muted playsInline preload="auto" aria-hidden="true">
          <source src="/echona-scroll.mp4" type="video/mp4" />
        </video>
        <div className="echona-vignette" aria-hidden="true" />
        <header className="echona-nav">
          <a className="echona-home-link" href="#home">HOME</a>
          <a className="echona-wordmark" href="#home" aria-label="Echona 2K26, Treasure Voyage">
            <span>ECHONA 2K26</span>
            <small>TREASURE VOYAGE</small>
          </a>
        </header>

        <div className="echona-title-block">
          <h1 id="echona-title">ECHONA <span>2026</span></h1>
          <p>TREASURE VOYAGE</p>
        </div>
        <a className="echona-scroll-cue" href="#journey" aria-label="Scroll to the journey section">
          <span>SCROLL TO EXPLORE</span><ArrowDown size={16} />
        </a>
      </section>
    </div>

    <section className="echona-journey" id="journey" aria-labelledby="journey-title">
      <p className="echona-eyebrow">THE VOYAGE AWAITS</p>
      <h2 id="journey-title">Your journey begins here.</h2>
      <p>Claim your place aboard the Treasure Voyage.</p>
      <button className="echona-join" type="button" onClick={onEnter}>JOIN THE VOYAGE <ArrowRight size={16} /></button>
    </section>
  </main>
}