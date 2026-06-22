'use client'

import { useEffect, useRef, type ReactNode } from 'react'

// ── SkyHero ───────────────────────────────────────────────────────────────
// A procedural dawn sky rendered in WebGL: layered fbm clouds drifting at
// different depths over a soft rising sun. The sky gently follows the cursor
// (desktop) or device tilt (mobile), and drifts on its own when idle — the
// literal "clarity emerging from the clouds." Falls back to a CSS dawn
// gradient when WebGL is unavailable, and freezes to a static frame under
// prefers-reduced-motion. Ported from the Ashray design export.

const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p,0.0,1.0); }'

const FS = [
  'precision highp float;',
  'uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uFollow; uniform vec3 uSun;',
  'float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }',
  'float noise(vec2 p){ vec2 i=floor(p),f=fract(p); float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.)); vec2 u=f*f*(3.-2.*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }',
  'float fbm(vec2 p){ float v=0.,a=0.55; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<6;i++){ v+=a*noise(p); p=m*p; a*=0.5; } return v; }',
  'float clouds(vec2 uv,float t,float s){ vec2 cp=uv*s; cp.x+=t; float w=fbm(cp*0.6+t*0.35); float d=fbm(cp+w*0.9); return d; }',
  'void main(){',
  '  vec2 uv = gl_FragCoord.xy/uRes.xy;',
  '  float aspect = uRes.x/uRes.y;',
  '  vec2 q = vec2((uv.x-0.5)*aspect, uv.y-0.5);',
  '  vec2 m = (uMouse-0.5)*uFollow;',
  '  vec3 skyTop = vec3(0.30,0.60,0.89);',
  '  vec3 skyMid = vec3(0.64,0.84,0.97);',
  '  vec3 skyLow = vec3(0.95,0.95,0.99);',
  '  vec3 sky = mix(skyLow, skyMid, smoothstep(0.0,0.58,uv.y));',
  '  sky = mix(sky, skyTop, smoothstep(0.5,1.0,uv.y));',
  '  vec2 sunPos = vec2(0.5 + m.x*0.40, 0.86 + m.y*0.18);',
  '  float sd = length(vec2((uv.x-sunPos.x)*aspect, uv.y-sunPos.y));',
  '  vec3 sunCol = uSun;',
  '  vec3 dawnPink = vec3(1.0,0.78,0.74);',
  '  vec3 dawnGold = vec3(1.0,0.84,0.58);',
  '  sky = mix(sky, dawnPink, smoothstep(0.62,0.0,uv.y)*0.16);',
  '  float halo = exp(-sd*2.3);',
  '  sky = mix(sky, dawnGold, halo*0.34);',
  '  sky += dawnPink * exp(-sd*4.0)*0.14;',
  '  sky += sunCol * exp(-sd*5.4)*0.46;',
  '  sky += sunCol * exp(-sd*1.7)*0.09;',
  '  vec2 uvFar = q + m*0.09; uvFar.x += 60.0;',
  '  float df = clouds(uvFar, uTime*0.011, 1.9);',
  '  float densFar = smoothstep(0.52,0.80,df);',
  '  vec2 uvNear = q + m*0.26;',
  '  float dn = clouds(uvNear, uTime*0.019, 3.1);',
  '  float densNear = smoothstep(0.50,0.83,dn);',
  '  float litF = clamp((df-0.42)*1.7,0.0,1.0);',
  '  float litN = clamp((dn-0.42)*1.7,0.0,1.0);',
  '  vec3 cloudShadow = vec3(0.72,0.81,0.92);',
  '  vec3 cloudLit = vec3(1.0,0.995,0.985);',
  '  vec3 cFar = mix(cloudShadow, cloudLit, litF) + sunCol*pow(litF,2.0)*0.16;',
  '  vec3 cNear = mix(cloudShadow*0.96, cloudLit, litN) + sunCol*pow(litN,2.0)*0.30;',
  '  vec3 col = sky;',
  '  col = mix(col, cFar, densFar*0.66);',
  '  col = mix(col, cNear, densNear*0.92);',
  '  col *= 1.0 - 0.11*length(q*vec2(0.65,1.0));',
  '  col = pow(col, vec3(0.96));',
  '  gl_FragColor = vec4(col,1.0);',
  '}',
].join('\n')

const DAWN_GRADIENT = 'linear-gradient(180deg,#5AA0DC 0%,#BFE0F7 55%,#FFFFFF 100%)'

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return [1.0, 0.8, 0.33]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

interface SkyHeroProps {
  children?: ReactNode
  className?: string
  sunGold?: string
  follow?: boolean
}

export default function SkyHero({
  children,
  className = '',
  sunGold = '#FFCB52',
  follow = true,
}: SkyHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let gl: WebGLRenderingContext | null = null
    try {
      gl =
        (canvas.getContext('webgl', {
          antialias: false,
          alpha: false,
          depth: false,
          premultipliedAlpha: false,
          powerPreference: 'high-performance',
        }) as WebGLRenderingContext | null) ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
    } catch {
      gl = null
    }

    if (!gl) {
      canvas.style.background = DAWN_GRADIENT
      return
    }

    const glc = gl
    const compile = (type: number, src: string): WebGLShader | null => {
      const s = glc.createShader(type)
      if (!s) return null
      glc.shaderSource(s, src)
      glc.compileShader(s)
      if (!glc.getShaderParameter(s, glc.COMPILE_STATUS)) {
        console.warn('[SkyHero shader]', glc.getShaderInfoLog(s))
      }
      return s
    }

    const prog = glc.createProgram()
    const vs = compile(glc.VERTEX_SHADER, VS)
    const fs = compile(glc.FRAGMENT_SHADER, FS)
    if (!prog || !vs || !fs) {
      canvas.style.background = DAWN_GRADIENT
      return
    }
    glc.attachShader(prog, vs)
    glc.attachShader(prog, fs)
    glc.linkProgram(prog)
    glc.useProgram(prog)

    const buf = glc.createBuffer()
    glc.bindBuffer(glc.ARRAY_BUFFER, buf)
    glc.bufferData(glc.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), glc.STATIC_DRAW)
    const loc = glc.getAttribLocation(prog, 'p')
    glc.enableVertexAttribArray(loc)
    glc.vertexAttribPointer(loc, 2, glc.FLOAT, false, 0, 0)

    const uRes = glc.getUniformLocation(prog, 'uRes')
    const uTime = glc.getUniformLocation(prog, 'uTime')
    const uMouse = glc.getUniformLocation(prog, 'uMouse')
    const uFollow = glc.getUniformLocation(prog, 'uFollow')
    const uSun = glc.getUniformLocation(prog, 'uSun')
    const sun = hexToRgb(sunGold)
    glc.uniform3f(uSun, sun[0], sun[1], sun[2])
    glc.uniform1f(uFollow, follow ? 1.0 : 0.0)

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const onResize = () => {
      const w = Math.round(canvas.clientWidth * dpr)
      const h = Math.round(canvas.clientHeight * dpr)
      canvas.width = w
      canvas.height = h
      glc.viewport(0, 0, w, h)
      glc.uniform2f(uRes, w, h)
    }
    onResize()
    window.addEventListener('resize', onResize, { passive: true })

    let tx = 0.5
    let ty = 0.5
    let cx = 0.5
    let cy = 0.5
    let lastMotion = 0
    let raf = 0
    const t0 = performance.now()

    const onPointer = (e: PointerEvent) => {
      tx = e.clientX / window.innerWidth
      ty = 1 - e.clientY / window.innerHeight
      lastMotion = performance.now()
    }
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null && e.beta == null) return
      const g = e.gamma || 0
      const b = e.beta || 0
      tx = 0.5 + Math.max(-1, Math.min(1, g / 32)) * 0.5
      ty = 0.5 + Math.max(-1, Math.min(1, (b - 45) / 32)) * 0.5
      lastMotion = performance.now()
    }

    if (reduceMotion) {
      // Single calm static frame — no loop, no listeners.
      glc.uniform1f(uTime, 6.0)
      glc.uniform2f(uMouse, 0.5, 0.52)
      glc.drawArrays(glc.TRIANGLES, 0, 3)
      return () => {
        window.removeEventListener('resize', onResize)
      }
    }

    if (follow) {
      window.addEventListener('pointermove', onPointer, { passive: true })
      window.addEventListener('deviceorientation', onOrient, { passive: true })
    }

    const tick = () => {
      const now = performance.now()
      const t = (now - t0) / 1000
      if (!follow || now - lastMotion > 1800) {
        tx = 0.5 + Math.sin(t * 0.11) * 0.34
        ty = 0.5 + Math.cos(t * 0.083) * 0.26
      }
      cx += (tx - cx) * 0.035
      cy += (ty - cy) * 0.035
      glc.uniform1f(uTime, t)
      glc.uniform2f(uMouse, cx, cy)
      glc.drawArrays(glc.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('deviceorientation', onOrient)
      const lose = glc.getExtension('WEBGL_lose_context')
      if (lose) lose.loseContext()
    }
  }, [sunGold, follow])

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full"
        style={{ background: DAWN_GRADIENT }}
      />
      {children}
    </div>
  )
}
