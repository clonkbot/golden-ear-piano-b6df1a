import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, Float, Stars, ContactShadows } from '@react-three/drei'
import { Suspense, useState, useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

// Piano note frequencies (middle octave C4 to B4 + one more octave)
const NOTES: { [key: string]: number } = {
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13,
  'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00,
  'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25,
  'E5': 659.26, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99,
  'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77,
}

const WHITE_KEYS = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5']
const BLACK_KEYS = ['C#4', 'D#4', 'F#4', 'G#4', 'A#4', 'C#5', 'D#5', 'F#5', 'G#5', 'A#5']

// Audio synthesis
const playNote = (frequency: number) => {
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime)

  // Piano-like envelope
  gainNode.gain.setValueAtTime(0.5, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.3, audioContext.currentTime + 0.1)
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 2)

  oscillator.start(audioContext.currentTime)
  oscillator.stop(audioContext.currentTime + 2)
}

// Floating dust particles
function DustParticles() {
  const count = 200
  const ref = useRef<THREE.Points>(null!)

  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 20
    positions[i * 3 + 1] = Math.random() * 10
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10
  }

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.02
      const positions = ref.current.geometry.attributes.position.array as Float32Array
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] += Math.sin(state.clock.elapsedTime + i) * 0.001
      }
      ref.current.geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#d4a574"
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  )
}

// Single piano key component
function PianoKey({
  note,
  isBlack,
  position,
  onPress,
  isPressed,
  isCorrect,
  isWrong,
  isTarget
}: {
  note: string
  isBlack: boolean
  position: [number, number, number]
  onPress: (note: string) => void
  isPressed: boolean
  isCorrect: boolean
  isWrong: boolean
  isTarget: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const [hovered, setHovered] = useState(false)

  const width = isBlack ? 0.35 : 0.55
  const height = isBlack ? 0.6 : 0.4
  const depth = isBlack ? 2.2 : 3.5

  let color = isBlack ? '#1a1a1a' : '#faf8f5'
  if (isCorrect) color = '#22c55e'
  else if (isWrong) color = '#ef4444'
  else if (isTarget) color = '#fbbf24'
  else if (hovered) color = isBlack ? '#333' : '#d4a574'

  const emissiveIntensity = (isCorrect || isWrong || isTarget) ? 0.3 : (hovered ? 0.1 : 0)

  useFrame(() => {
    if (meshRef.current) {
      const targetY = isPressed ? position[1] - 0.08 : position[1]
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetY, 0.3)
    }
  })

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation()
        onPress(note)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'default'
      }}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial
        color={color}
        metalness={isBlack ? 0.3 : 0.1}
        roughness={isBlack ? 0.4 : 0.2}
        emissive={color}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  )
}

// Full piano component
function Piano({
  onKeyPress,
  pressedKey,
  correctKey,
  wrongKey,
  targetKey
}: {
  onKeyPress: (note: string) => void
  pressedKey: string | null
  correctKey: string | null
  wrongKey: string | null
  targetKey: string | null
}) {
  const whiteKeyPositions: [number, number, number][] = WHITE_KEYS.map((_, i) => [
    (i - WHITE_KEYS.length / 2 + 0.5) * 0.6,
    0.2,
    0
  ])

  // Black key positions relative to white keys
  const blackKeyOffsets = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12] // skip after E and B
  const blackKeyPositions: [number, number, number][] = BLACK_KEYS.map((_, i) => [
    (blackKeyOffsets[i] - WHITE_KEYS.length / 2 + 1) * 0.6,
    0.5,
    -0.5
  ])

  return (
    <group rotation={[0.1, 0, 0]} position={[0, -1, 0]}>
      {/* Piano body */}
      <mesh position={[0, -0.3, 0]} receiveShadow castShadow>
        <boxGeometry args={[9.5, 0.6, 4.5]} />
        <meshStandardMaterial
          color="#1f1f1f"
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>

      {/* Gold trim */}
      <mesh position={[0, -0.02, 1.8]} receiveShadow>
        <boxGeometry args={[9.6, 0.08, 0.15]} />
        <meshStandardMaterial
          color="#d4a574"
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* White keys */}
      {WHITE_KEYS.map((note, i) => (
        <PianoKey
          key={note}
          note={note}
          isBlack={false}
          position={whiteKeyPositions[i]}
          onPress={onKeyPress}
          isPressed={pressedKey === note}
          isCorrect={correctKey === note}
          isWrong={wrongKey === note}
          isTarget={targetKey === note}
        />
      ))}

      {/* Black keys */}
      {BLACK_KEYS.map((note, i) => (
        <PianoKey
          key={note}
          note={note}
          isBlack={true}
          position={blackKeyPositions[i]}
          onPress={onKeyPress}
          isPressed={pressedKey === note}
          isCorrect={correctKey === note}
          isWrong={wrongKey === note}
          isTarget={targetKey === note}
        />
      ))}
    </group>
  )
}

// Spotlight beam effect
function SpotlightBeam() {
  return (
    <mesh position={[0, 6, 0]} rotation={[0, 0, 0]}>
      <coneGeometry args={[3, 8, 32, 1, true]} />
      <meshBasicMaterial
        color="#d4a574"
        transparent
        opacity={0.03}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

// Game UI overlay
function GameUI({
  score,
  streak,
  gameState,
  onPlayNote,
  onStartGame,
  feedback,
  difficulty,
  onChangeDifficulty
}: {
  score: number
  streak: number
  gameState: 'idle' | 'playing' | 'waiting'
  onPlayNote: () => void
  onStartGame: () => void
  feedback: string
  difficulty: 'easy' | 'medium' | 'hard'
  onChangeDifficulty: (d: 'easy' | 'medium' | 'hard') => void
}) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 md:p-6 flex justify-between items-start pointer-events-auto">
        <div className="text-left">
          <h1 className="font-display text-2xl md:text-4xl text-[#d4a574] tracking-wider">
            GOLDEN EAR
          </h1>
          <p className="font-body text-xs md:text-sm text-[#8a7a6a] tracking-widest uppercase mt-1">
            Piano Note Training
          </p>
        </div>

        <div className="text-right">
          <div className="font-display text-3xl md:text-5xl text-[#faf8f5]">
            {score}
          </div>
          <div className="text-xs md:text-sm text-[#8a7a6a] tracking-wider">
            SCORE
          </div>
          {streak > 0 && (
            <div className="mt-2 text-[#d4a574] font-body text-sm">
              {streak}× STREAK
            </div>
          )}
        </div>
      </div>

      {/* Center content */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-auto">
        {gameState === 'idle' && (
          <div className="space-y-6 md:space-y-8">
            <div className="space-y-2">
              <p className="font-body text-[#8a7a6a] text-sm md:text-base tracking-wider">
                CHOOSE YOUR CHALLENGE
              </p>
              <div className="flex gap-2 md:gap-4 justify-center">
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => onChangeDifficulty(d)}
                    className={`px-4 md:px-6 py-2 md:py-3 font-body text-xs md:text-sm tracking-widest uppercase transition-all duration-300 ${
                      difficulty === d
                        ? 'bg-[#d4a574] text-[#0f0f0f]'
                        : 'border border-[#3a3530] text-[#8a7a6a] hover:border-[#d4a574] hover:text-[#d4a574]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={onStartGame}
              className="px-8 md:px-12 py-4 md:py-5 bg-gradient-to-r from-[#d4a574] to-[#b8956a] text-[#0f0f0f] font-display text-lg md:text-xl tracking-widest hover:from-[#e5b685] hover:to-[#c9a67b] transition-all duration-300 shadow-2xl hover:shadow-[#d4a574]/20"
            >
              BEGIN
            </button>
          </div>
        )}

        {gameState === 'playing' && (
          <div className="space-y-4">
            <div className="w-16 h-16 md:w-20 md:h-20 mx-auto rounded-full border-2 border-[#d4a574] flex items-center justify-center animate-pulse">
              <svg className="w-6 h-6 md:w-8 md:h-8 text-[#d4a574]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            </div>
            <p className="font-body text-[#d4a574] tracking-wider animate-pulse text-sm md:text-base">
              LISTENING...
            </p>
            <button
              onClick={onPlayNote}
              className="mt-4 px-6 py-3 border border-[#3a3530] text-[#8a7a6a] font-body text-xs md:text-sm tracking-widest hover:border-[#d4a574] hover:text-[#d4a574] transition-all"
            >
              REPLAY NOTE
            </button>
          </div>
        )}

        {feedback && (
          <div className={`font-display text-2xl md:text-4xl tracking-wider animate-bounce ${
            feedback.includes('✓') ? 'text-green-400' : 'text-red-400'
          }`}>
            {feedback}
          </div>
        )}
      </div>

      {/* Bottom instructions */}
      {gameState === 'waiting' && (
        <div className="absolute bottom-24 md:bottom-32 left-0 right-0 text-center pointer-events-auto">
          <p className="font-body text-[#8a7a6a] text-xs md:text-sm tracking-wider">
            CLICK A KEY TO GUESS
          </p>
        </div>
      )}
    </div>
  )
}

// Main App component
function App() {
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'waiting'>('idle')
  const [currentNote, setCurrentNote] = useState<string | null>(null)
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [correctKey, setCorrectKey] = useState<string | null>(null)
  const [wrongKey, setWrongKey] = useState<string | null>(null)
  const [targetKey, setTargetKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')

  const getAvailableNotes = useCallback(() => {
    if (difficulty === 'easy') return WHITE_KEYS.slice(0, 7) // One octave white keys
    if (difficulty === 'medium') return WHITE_KEYS // All white keys
    return [...WHITE_KEYS, ...BLACK_KEYS] // All keys
  }, [difficulty])

  const playCurrentNote = useCallback(() => {
    if (currentNote) {
      playNote(NOTES[currentNote])
    }
  }, [currentNote])

  const startGame = useCallback(() => {
    const notes = getAvailableNotes()
    const randomNote = notes[Math.floor(Math.random() * notes.length)]
    setCurrentNote(randomNote)
    setGameState('playing')
    setFeedback('')
    setCorrectKey(null)
    setWrongKey(null)
    setTargetKey(null)

    // Small delay before playing
    setTimeout(() => {
      playNote(NOTES[randomNote])
      setTimeout(() => {
        setGameState('waiting')
      }, 500)
    }, 300)
  }, [getAvailableNotes])

  const handleKeyPress = useCallback((note: string) => {
    if (gameState !== 'waiting') return

    setPressedKey(note)
    playNote(NOTES[note])

    setTimeout(() => setPressedKey(null), 200)

    if (note === currentNote) {
      setCorrectKey(note)
      setScore(s => s + (10 * (streak + 1)))
      setStreak(s => s + 1)
      setFeedback('✓ PERFECT!')

      setTimeout(() => {
        setCorrectKey(null)
        startGame()
      }, 1200)
    } else {
      setWrongKey(note)
      setTargetKey(currentNote)
      setStreak(0)
      setFeedback(`✗ It was ${currentNote}`)

      setTimeout(() => {
        setWrongKey(null)
        setTargetKey(null)
        startGame()
      }, 2000)
    }
  }, [gameState, currentNote, streak, startGame])

  // Keyboard controls
  useEffect(() => {
    const keyMap: { [key: string]: string } = {
      'a': 'C4', 'w': 'C#4', 's': 'D4', 'e': 'D#4', 'd': 'E4',
      'f': 'F4', 't': 'F#4', 'g': 'G4', 'y': 'G#4', 'h': 'A4',
      'u': 'A#4', 'j': 'B4', 'k': 'C5', 'o': 'C#5', 'l': 'D5',
      'p': 'D#5', ';': 'E5'
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const note = keyMap[e.key.toLowerCase()]
      if (note && gameState === 'waiting') {
        handleKeyPress(note)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState, handleKeyPress])

  return (
    <div className="w-screen h-screen bg-[#0a0a0a] overflow-hidden relative">
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a1510] via-[#0f0f0f] to-[#0a0808] pointer-events-none" />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.6) 100%)'
        }}
      />

      {/* 3D Canvas */}
      <Canvas
        shadows
        camera={{ position: [0, 4, 8], fov: 50 }}
        className="absolute inset-0"
      >
        <Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.15} color="#d4a574" />
          <spotLight
            position={[0, 10, 2]}
            angle={0.4}
            penumbra={0.8}
            intensity={2}
            color="#fff5e6"
            castShadow
            shadow-mapSize={2048}
          />
          <spotLight
            position={[-5, 8, 5]}
            angle={0.3}
            penumbra={1}
            intensity={0.5}
            color="#d4a574"
          />
          <spotLight
            position={[5, 8, 5]}
            angle={0.3}
            penumbra={1}
            intensity={0.5}
            color="#d4a574"
          />

          {/* Environment */}
          <Environment preset="night" />
          <Stars radius={50} depth={50} count={1000} factor={2} saturation={0} fade speed={0.5} />

          {/* Dust particles */}
          <DustParticles />

          {/* Spotlight beam effect */}
          <SpotlightBeam />

          {/* Piano */}
          <Float speed={0.5} rotationIntensity={0.02} floatIntensity={0.1}>
            <Piano
              onKeyPress={handleKeyPress}
              pressedKey={pressedKey}
              correctKey={correctKey}
              wrongKey={wrongKey}
              targetKey={targetKey}
            />
          </Float>

          {/* Floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, 0]} receiveShadow>
            <planeGeometry args={[50, 50]} />
            <meshStandardMaterial color="#0f0f0f" metalness={0.5} roughness={0.8} />
          </mesh>

          {/* Contact shadows */}
          <ContactShadows
            position={[0, -1.99, 0]}
            opacity={0.6}
            scale={20}
            blur={2}
            far={10}
            color="#000000"
          />

          {/* Controls */}
          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={5}
            maxDistance={15}
            minPolarAngle={0.3}
            maxPolarAngle={Math.PI / 2.2}
            enablePan={false}
          />
        </Suspense>
      </Canvas>

      {/* Game UI */}
      <GameUI
        score={score}
        streak={streak}
        gameState={gameState}
        onPlayNote={playCurrentNote}
        onStartGame={startGame}
        feedback={feedback}
        difficulty={difficulty}
        onChangeDifficulty={setDifficulty}
      />

      {/* Footer */}
      <footer className="absolute bottom-3 md:bottom-4 left-0 right-0 text-center pointer-events-none">
        <p className="font-body text-[10px] md:text-xs text-[#4a453f] tracking-wider">
          Requested by <span className="text-[#6a635a]">@ChrisPirillo</span> · Built by <span className="text-[#6a635a]">@clonkbot</span>
        </p>
      </footer>
    </div>
  )
}

export default App
