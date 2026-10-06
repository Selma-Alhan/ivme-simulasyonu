/**
 * Sabit İvmeli Hareket Simülasyonu - App Engine
 * High School Physics (11. Sınıf Fizik Müfredatı)
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    const state = {
        v0: 0,            // Initial velocity (m/s)
        a: 2,             // Acceleration (m/s^2)
        tMax: 10,         // Total duration (seconds)
        tCurrent: 0,      // Current simulation time (seconds)
        speedMult: 1.0,   // Playback speed multiplier (0.25x, 0.5x, 1x, 2x)
        isRunning: false, // Animation loop running flag
        lastTimestamp: 0, // Frame timestamp for dt calculation
        
        // World coordinates auto-scaling bounds
        worldMinX: -20,
        worldMaxX: 100,
        
        // Physics Turning Point
        turningPoint: null // { t: number, x: number } or null
    };

    // --- DOM Elements ---
    const elements = {
        // Controls
        v0Range: document.getElementById('v0Range'),
        v0Number: document.getElementById('v0Number'),
        v0Val: document.getElementById('v0Val'),
        
        aRange: document.getElementById('aRange'),
        aNumber: document.getElementById('aNumber'),
        aVal: document.getElementById('aVal'),

        tRange: document.getElementById('tRange'),
        tNumber: document.getElementById('tNumber'),
        tVal: document.getElementById('tVal'),

        speedGroup: document.getElementById('speedGroup'),
        
        startBtn: document.getElementById('startBtn'),
        pauseBtn: document.getElementById('pauseBtn'),
        resetBtn: document.getElementById('resetBtn'),

        // Canvases
        simCanvas: document.getElementById('simCanvas'),
        xtCanvas: document.getElementById('xtCanvas'),
        vtCanvas: document.getElementById('vtCanvas'),
        atCanvas: document.getElementById('atCanvas'),

        // Scrubber
        scrubberRange: document.getElementById('scrubberRange'),
        scrubberVal: document.getElementById('scrubberVal'),

        // HUD Elements
        hudTime: document.getElementById('hudTime'),
        hudPos: document.getElementById('hudPos'),
        hudVel: document.getElementById('hudVel'),
        hudAccel: document.getElementById('hudAccel'),
        hudStatus: document.getElementById('hudStatus'),

        // Math Elements
        eqPosSub: document.getElementById('eqPosSub'),
        eqPosRes: document.getElementById('eqPosRes'),
        eqVelSub: document.getElementById('eqVelSub'),
        eqVelRes: document.getElementById('eqVelRes'),
        phTrend: document.getElementById('phTrend'),
        stopTimeText: document.getElementById('stopTimeText'),
        totalDispText: document.getElementById('totalDispText'),

        // Theme Toggle
        themeToggleBtn: document.getElementById('themeToggleBtn'),
        themeIcon: document.getElementById('themeIcon')
    };

    // Canvas Contexts
    const ctx = {
        sim: elements.simCanvas.getContext('2d'),
        xt: elements.xtCanvas.getContext('2d'),
        vt: elements.vtCanvas.getContext('2d'),
        at: elements.atCanvas.getContext('2d')
    };

    // High DPI Canvas Scaling Helper
    function setupHighDPICanvas(canvas, context) {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        // Set actual canvas resolution
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        // Reset scale and apply dpr transform
        context.resetTransform();
        context.scale(dpr, dpr);
        return { width: rect.width, height: rect.height };
    }

    // --- Physics Engine Calculations ---
    function getPosition(t, v0 = state.v0, a = state.a) {
        return v0 * t + 0.5 * a * t * t;
    }

    function getVelocity(t, v0 = state.v0, a = state.a) {
        return v0 + a * t;
    }

    function calculateTurningPoint() {
        // Turning point occurs when v(t) = 0 => v0 + a*t = 0 => t = -v0 / a
        if (state.a !== 0) {
            const tStop = -state.v0 / state.a;
            if (tStop > 0 && tStop <= state.tMax) {
                const xStop = getPosition(tStop);
                state.turningPoint = { t: tStop, x: xStop };
                return;
            }
        }
        state.turningPoint = null;
    }

    function calculateWorldBounds() {
        // Calculate min and max position reachable within 0..tMax
        let minX = 0;
        let maxX = 0;
        
        const sampleCount = 50;
        for (let i = 0; i <= sampleCount; i++) {
            const t = (i / sampleCount) * state.tMax;
            const x = getPosition(t);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
        }

        if (state.turningPoint) {
            if (state.turningPoint.x < minX) minX = state.turningPoint.x;
            if (state.turningPoint.x > maxX) maxX = state.turningPoint.x;
        }

        // Add padding margin to world bounds
        const range = Math.max(maxX - minX, 40);
        const margin = range * 0.15;
        
        state.worldMinX = minX - margin;
        state.worldMaxX = maxX + margin;
    }

    function getMotionStatus(v, a) {
        if (Math.abs(v) < 0.001) {
            if (Math.abs(a) < 0.001) return { text: "Durgun", type: "idle" };
            return { text: "Anlık Durma / Yön Değiştirme", type: "turn" };
        }
        if (Math.abs(a) < 0.001) {
            return { text: v > 0 ? "Pozitif Yönde Sabit Hızlı" : "Negatif Yönde Sabit Hızlı", type: "constant" };
        }
        if (v * a > 0) {
            return { text: v > 0 ? "Pozitif Yönde Hızlanan" : "Negatif Yönde Hızlanan", type: "speedup" };
        } else {
            return { text: v > 0 ? "Pozitif Yönde Yavaşlayan" : "Negatif Yönde Yavaşlayan", type: "slowdown" };
        }
    }

    // --- UI Update Functions ---
    function updateTelemetryHUD() {
        const t = state.tCurrent;
        const x = getPosition(t);
        const v = getVelocity(t);
        const a = state.a;
        const status = getMotionStatus(v, a);

        elements.hudTime.innerHTML = `${t.toFixed(2)} <small>s</small>`;
        elements.hudPos.innerHTML = `${x.toFixed(2)} <small>m</small>`;
        elements.hudVel.innerHTML = `${v.toFixed(2)} <small>m/s</small>`;
        elements.hudAccel.innerHTML = `${a.toFixed(2)} <small>m/s²</small>`;
        elements.hudStatus.textContent = status.text;

        // Math Equation Substitutions
        const v0Str = state.v0 >= 0 ? `${state.v0.toFixed(1)}` : `(${state.v0.toFixed(1)})`;
        const aStr = state.a >= 0 ? `${state.a.toFixed(1)}` : `(${state.a.toFixed(1)})`;
        const tStr = t.toFixed(2);

        const posEquationText = `x(${tStr}s) = 0 + ${v0Str} · (${tStr}) + ½ · ${aStr} · (${tStr})²`;
        const posResultText = `x(${tStr}s) = ${x.toFixed(2)} m`;
        const velEquationText = `v(${tStr}s) = ${v0Str} + ${aStr} · (${tStr})`;
        const velResultText = `v(${tStr}s) = ${v.toFixed(2)} m/s`;

        if (window.katex) {
            try {
                katex.render(`x(${tStr}\\text{s}) = 0 + ${v0Str} \\cdot (${tStr}) + \\frac{1}{2} \\cdot ${aStr} \\cdot (${tStr})^2`, elements.eqPosSub, { displayMode: false });
                katex.render(`x(${tStr}\\text{s}) = ${x.toFixed(2)} \\text{ m}`, elements.eqPosRes, { displayMode: false });
                katex.render(`v(${tStr}\\text{s}) = ${v0Str} + ${aStr} \\cdot (${tStr})`, elements.eqVelSub, { displayMode: false });
                katex.render(`v(${tStr}\\text{s}) = ${v.toFixed(2)} \\text{ m/s}`, elements.eqVelRes, { displayMode: false });
            } catch (err) {
                elements.eqPosSub.textContent = posEquationText;
                elements.eqPosRes.textContent = posResultText;
                elements.eqVelSub.textContent = velEquationText;
                elements.eqVelRes.textContent = velResultText;
            }
        } else {
            elements.eqPosSub.textContent = posEquationText;
            elements.eqPosRes.textContent = posResultText;
            elements.eqVelSub.textContent = velEquationText;
            elements.eqVelRes.textContent = velResultText;
        }

        // Physics Highlights
        if (Math.abs(a) < 0.001) {
            elements.phTrend.innerHTML = "💡 İvme $a=0$ olduğu için hız sabittir ($v = v_0$).";
        } else if (v * a > 0) {
            elements.phTrend.innerHTML = "⚡ Hız ve İvme aynı yönlü olduğu için cisim <strong>HIZLANMAKTADIR</strong>.";
        } else if (v * a < 0) {
            elements.phTrend.innerHTML = "🛑 Hız ve İvme zıt yönlü olduğu için cisim <strong>YAVAŞLAMAKTADIR</strong>.";
        } else {
            elements.phTrend.innerHTML = "📍 Cisim anlık olarak durmuştur ($v=0$).";
        }

        if (state.turningPoint) {
            elements.stopTimeText.innerHTML = `t = <strong>${state.turningPoint.t.toFixed(2)}s</strong> anında (x = ${state.turningPoint.x.toFixed(2)}m)`;
        } else {
            elements.stopTimeText.textContent = "Süre içinde durma/yön değiştirme yok";
        }

        const totalX = getPosition(state.tMax);
        elements.totalDispText.textContent = `${totalX.toFixed(2)} m`;

        // Scrubber update
        elements.scrubberRange.value = t;
        elements.scrubberVal.textContent = `${t.toFixed(2)} s`;
    }

    // --- Render Simulation Scene (Main Canvas) ---
    function renderSimulationCanvas() {
        const canvas = elements.simCanvas;
        const context = ctx.sim;
        const dims = setupHighDPICanvas(canvas, context);
        const W = dims.width;
        const H = dims.height;

        const isLight = document.body.classList.contains('light-theme');

        // Background
        context.fillStyle = isLight ? '#f8fafc' : '#070a10';
        context.fillRect(0, 0, W, H);

        const roadY = H * 0.68;
        const roadHeight = 40;

        // Calculate Scale: Meters to Pixels
        const worldRange = state.worldMaxX - state.worldMinX;
        const scaleX = (W - 100) / worldRange; // 50px padding left/right
        
        function worldToCanvasX(x) {
            return 50 + (x - state.worldMinX) * scaleX;
        }

        // Draw Road Surface
        context.fillStyle = isLight ? '#cbd5e1' : '#1e293b';
        context.fillRect(0, roadY, W, roadHeight);

        // Road Top Border
        context.strokeStyle = isLight ? '#94a3b8' : '#334155';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(0, roadY);
        context.lineTo(W, roadY);
        context.stroke();

        // Draw Grid & Meter Ticks
        const tickStep = worldRange > 100 ? 20 : (worldRange > 40 ? 10 : 5);
        const startTick = Math.floor(state.worldMinX / tickStep) * tickStep;

        context.font = '11px "JetBrains Mono", monospace';
        context.textAlign = 'center';

        for (let tick = startTick; tick <= state.worldMaxX; tick += tickStep) {
            const cx = worldToCanvasX(tick);
            if (cx >= 40 && cx <= W - 40) {
                // Major tick line
                context.strokeStyle = tick === 0 ? (isLight ? '#0284c7' : '#38bdf8') : (isLight ? '#94a3b8' : '#475569');
                context.lineWidth = tick === 0 ? 2 : 1;
                context.beginPath();
                context.moveTo(cx, roadY);
                context.lineTo(cx, roadY + 12);
                context.stroke();

                // Tick label
                context.fillStyle = tick === 0 ? (isLight ? '#0284c7' : '#38bdf8') : (isLight ? '#64748b' : '#94a3b8');
                context.fillText(`${tick}m`, cx, roadY + 26);
            }
        }

        // Origin Marker (x = 0 line)
        const originX = worldToCanvasX(0);
        if (originX >= 0 && originX <= W) {
            context.strokeStyle = isLight ? 'rgba(2, 132, 199, 0.4)' : 'rgba(56, 189, 248, 0.4)';
            context.setLineDash([4, 4]);
            context.beginPath();
            context.moveTo(originX, 20);
            context.lineTo(originX, roadY);
            context.stroke();
            context.setLineDash([]);

            context.fillStyle = isLight ? '#0284c7' : '#38bdf8';
            context.fillText("BAŞLANGIÇ (x=0)", originX, 28);
        }

        // Turning Point Marker (if any)
        if (state.turningPoint) {
            const tpX = worldToCanvasX(state.turningPoint.x);
            if (tpX >= 0 && tpX <= W) {
                context.strokeStyle = '#eab308';
                context.setLineDash([3, 3]);
                context.beginPath();
                context.moveTo(tpX, 40);
                context.lineTo(tpX, roadY);
                context.stroke();
                context.setLineDash([]);

                // Pin Icon / Marker
                context.fillStyle = '#eab308';
                context.font = '14px sans-serif';
                context.fillText('📍 Durma/Yön Değiştirme', tpX, 35);
                context.font = '11px "JetBrains Mono", monospace';
                context.fillText(`t=${state.turningPoint.t.toFixed(1)}s`, tpX, 50);
            }
        }

        // Current Car Position
        const currentX = getPosition(state.tCurrent);
        const carCX = worldToCanvasX(currentX);
        const carY = roadY - 14;

        // Draw Motion Trail Path
        context.strokeStyle = isLight ? 'rgba(56, 189, 248, 0.3)' : 'rgba(56, 189, 248, 0.25)';
        context.lineWidth = 4;
        context.beginPath();
        const startX = worldToCanvasX(0);
        context.moveTo(startX, carY);
        context.lineTo(carCX, carY);
        context.stroke();

        // Draw Car Body
        const carW = 44;
        const carH = 22;
        const carLeft = carCX - carW / 2;
        const carTop = carY - carH;

        // Car chassis shadow
        context.fillStyle = 'rgba(0, 0, 0, 0.3)';
        context.beginPath();
        context.ellipse(carCX, roadY - 2, carW / 2, 4, 0, 0, Math.PI * 2);
        context.fill();

        // Car main body gradient
        const currentV = getVelocity(state.tCurrent);
        const carGrad = context.createLinearGradient(carLeft, carTop, carLeft + carW, carTop + carH);
        if (currentV >= 0) {
            carGrad.addColorStop(0, '#0284c7');
            carGrad.addColorStop(1, '#38bdf8');
        } else {
            carGrad.addColorStop(0, '#c084fc');
            carGrad.addColorStop(1, '#a855f7');
        }

        // Body shape (rounded rectangle)
        context.fillStyle = carGrad;
        context.beginPath();
        context.roundRect(carLeft, carTop, carW, carH, [6, 6, 2, 2]);
        context.fill();

        // Car Roof / Cabin
        context.fillStyle = isLight ? '#0f172a' : '#0f172a';
        context.beginPath();
        context.roundRect(carLeft + 8, carTop - 10, carW - 16, 12, [4, 4, 0, 0]);
        context.fill();

        // Wheels
        const wheelRadius = 6;
        const wheelY = roadY - wheelRadius;
        const wheelAngle = currentX / 0.5; // angle proportional to position

        [carLeft + 10, carLeft + carW - 10].forEach(wx => {
            // Tire
            context.fillStyle = '#1e293b';
            context.beginPath();
            context.arc(wx, wheelY, wheelRadius, 0, Math.PI * 2);
            context.fill();

            // Rim rotation line
            context.strokeStyle = '#94a3b8';
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(wx, wheelY);
            context.lineTo(wx + wheelRadius * Math.cos(wheelAngle), wheelY + wheelRadius * Math.sin(wheelAngle));
            context.stroke();
        });

        // --- DRAW VECTOR ARROWS ---
        
        // 1. Velocity Vector Arrow (v) - Above Car
        if (Math.abs(currentV) > 0.05) {
            const vArrowY = carTop - 22;
            const maxArrowLen = 110;
            const vLen = Math.min(Math.abs(currentV) / 20, 1) * maxArrowLen;
            const dir = currentV >= 0 ? 1 : -1;
            
            const startVX = carCX;
            const endVX = carCX + dir * Math.max(vLen, 25);

            context.strokeStyle = isLight ? '#059669' : '#10b981';
            context.fillStyle = isLight ? '#059669' : '#10b981';
            context.lineWidth = 4;

            // Shaft
            context.beginPath();
            context.moveTo(startVX, vArrowY);
            context.lineTo(endVX, vArrowY);
            context.stroke();

            // Arrowhead
            context.beginPath();
            context.moveTo(endVX, vArrowY);
            context.lineTo(endVX - dir * 10, vArrowY - 6);
            context.lineTo(endVX - dir * 10, vArrowY + 6);
            context.closePath();
            context.fill();

            // Vector Label
            context.font = 'bold 12px "JetBrains Mono", monospace';
            context.textAlign = dir >= 0 ? 'left' : 'right';
            const labelX = endVX + dir * 6;
            context.fillText(`v = ${currentV >= 0 ? '+' : ''}${currentV.toFixed(1)} m/s`, labelX, vArrowY + 4);
        }

        // 2. Acceleration Vector Arrow (a) - Below Car
        const currentA = state.a;
        if (Math.abs(currentA) > 0.05) {
            const aArrowY = roadY + 36;
            const maxArrowLen = 100;
            const aLen = Math.min(Math.abs(currentA) / 10, 1) * maxArrowLen;
            const dir = currentA >= 0 ? 1 : -1;

            const startAX = carCX;
            const endAX = carCX + dir * Math.max(aLen, 25);

            context.strokeStyle = isLight ? '#ea580c' : '#f97316';
            context.fillStyle = isLight ? '#ea580c' : '#f97316';
            context.lineWidth = 4;

            // Shaft
            context.beginPath();
            context.moveTo(startAX, aArrowY);
            context.lineTo(endAX, aArrowY);
            context.stroke();

            // Arrowhead
            context.beginPath();
            context.moveTo(endAX, aArrowY);
            context.lineTo(endAX - dir * 10, aArrowY - 6);
            context.lineTo(endAX - dir * 10, aArrowY + 6);
            context.closePath();
            context.fill();

            // Vector Label
            context.font = 'bold 12px "JetBrains Mono", monospace';
            context.textAlign = dir >= 0 ? 'left' : 'right';
            const labelX = endAX + dir * 6;
            context.fillText(`a = ${currentA >= 0 ? '+' : ''}${currentA.toFixed(1)} m/s²`, labelX, aArrowY + 4);
        }
    }

    // --- Render Synchronous Graphs (x-t, v-t, a-t) ---
    function renderGraphs() {
        const isLight = document.body.classList.contains('light-theme');
        const gridColor = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
        const axisColor = isLight ? '#64748b' : '#94a3b8';
        const textColor = isLight ? '#475569' : '#94a3b8';

        // -------------------------------------------------------------
        // Graph 1: x-t (Position - Time)
        // -------------------------------------------------------------
        {
            const canvas = elements.xtCanvas;
            const context = ctx.xt;
            const { width: W, height: H } = setupHighDPICanvas(canvas, context);

            context.fillStyle = isLight ? '#ffffff' : '#070a10';
            context.fillRect(0, 0, W, H);

            const padL = 45, padR = 15, padT = 20, padB = 30;
            const plotW = W - padL - padR;
            const plotH = H - padT - padB;

            // Y scale calculation (Min/Max position in 0..tMax)
            const minX = Math.min(0, state.worldMinX);
            const maxX = Math.max(10, state.worldMaxX);
            const yRange = (maxX - minX) || 1;

            function toCanvas(t, x) {
                const cx = padL + (t / state.tMax) * plotW;
                const cy = padT + plotH - ((x - minX) / yRange) * plotH;
                return { cx, cy };
            }

            // Zero Axis
            const zeroY = toCanvas(0, 0).cy;
            context.strokeStyle = gridColor;
            context.lineWidth = 1;
            context.beginPath();
            context.moveTo(padL, zeroY);
            context.lineTo(W - padR, zeroY);
            context.stroke();

            // Grid Lines & Labels
            context.font = '10px "JetBrains Mono", monospace';
            context.fillStyle = textColor;
            context.textAlign = 'right';

            // Y ticks
            const yTickCount = 4;
            for (let i = 0; i <= yTickCount; i++) {
                const yVal = minX + (i / yTickCount) * yRange;
                const { cy } = toCanvas(0, yVal);
                context.fillText(Math.round(yVal) + 'm', padL - 6, cy + 3);
            }

            // X ticks (Time)
            context.textAlign = 'center';
            for (let t = 0; t <= state.tMax; t += Math.ceil(state.tMax / 5)) {
                const { cx } = toCanvas(t, 0);
                context.fillText(t + 's', cx, H - 8);
            }

            // Full Parabolic Curve (0..tMax)
            context.strokeStyle = isLight ? 'rgba(147, 51, 234, 0.3)' : 'rgba(168, 85, 247, 0.3)';
            context.lineWidth = 2;
            context.setLineDash([3, 3]);
            context.beginPath();
            for (let i = 0; i <= 100; i++) {
                const t = (i / 100) * state.tMax;
                const x = getPosition(t);
                const { cx, cy } = toCanvas(t, x);
                if (i === 0) context.moveTo(cx, cy);
                else context.lineTo(cx, cy);
            }
            context.stroke();
            context.setLineDash([]);

            // Trajectory curve up to tCurrent
            context.strokeStyle = isLight ? '#9333ea' : '#a855f7';
            context.lineWidth = 3;
            context.beginPath();
            const curStep = Math.max(1, Math.floor((state.tCurrent / state.tMax) * 100));
            for (let i = 0; i <= curStep; i++) {
                const t = (i / curStep) * state.tCurrent;
                const x = getPosition(t);
                const { cx, cy } = toCanvas(t, x);
                if (i === 0) context.moveTo(cx, cy);
                else context.lineTo(cx, cy);
            }
            context.stroke();

            // Current Pointer Dot
            const curX = getPosition(state.tCurrent);
            const { cx: curCX, cy: curCY } = toCanvas(state.tCurrent, curX);

            context.fillStyle = isLight ? '#9333ea' : '#a855f7';
            context.beginPath();
            context.arc(curCX, curCY, 6, 0, Math.PI * 2);
            context.fill();

            // Tangent Slope Line (instantaneous velocity = slope)
            const vInst = getVelocity(state.tCurrent);
            const dtSlope = 1.0;
            const { cx: t1X, cy: t1Y } = toCanvas(state.tCurrent - dtSlope, curX - vInst * dtSlope);
            const { cx: t2X, cy: t2Y } = toCanvas(state.tCurrent + dtSlope, curX + vInst * dtSlope);

            context.strokeStyle = isLight ? '#059669' : '#10b981';
            context.lineWidth = 1.5;
            context.beginPath();
            context.moveTo(t1X, t1Y);
            context.lineTo(t2X, t2Y);
            context.stroke();
        }

        // -------------------------------------------------------------
        // Graph 2: v-t (Velocity - Time)
        // -------------------------------------------------------------
        {
            const canvas = elements.vtCanvas;
            const context = ctx.vt;
            const { width: W, height: H } = setupHighDPICanvas(canvas, context);

            context.fillStyle = isLight ? '#ffffff' : '#070a10';
            context.fillRect(0, 0, W, H);

            const padL = 45, padR = 15, padT = 20, padB = 30;
            const plotW = W - padL - padR;
            const plotH = H - padT - padB;

            // Y scale calculation
            const vMinCalculated = Math.min(state.v0, getVelocity(state.tMax));
            const vMaxCalculated = Math.max(state.v0, getVelocity(state.tMax));
            const minV = Math.min(-25, Math.floor(vMinCalculated / 10) * 10 - 5);
            const maxV = Math.max(25, Math.ceil(vMaxCalculated / 10) * 10 + 5);
            const yRange = (maxV - minV) || 1;

            function toCanvas(t, v) {
                const cx = padL + (t / state.tMax) * plotW;
                const cy = padT + plotH - ((v - minV) / yRange) * plotH;
                return { cx, cy };
            }

            // Zero Axis Line (v = 0)
            const zeroY = toCanvas(0, 0).cy;
            context.strokeStyle = axisColor;
            context.lineWidth = 1.5;
            context.beginPath();
            context.moveTo(padL, zeroY);
            context.lineTo(W - padR, zeroY);
            context.stroke();

            // Y ticks
            context.font = '10px "JetBrains Mono", monospace';
            context.fillStyle = textColor;
            context.textAlign = 'right';

            for (let vVal = minV; vVal <= maxV; vVal += (maxV - minV) / 4) {
                const { cy } = toCanvas(0, vVal);
                context.fillText(Math.round(vVal) + 'm/s', padL - 4, cy + 3);
            }

            // X ticks (Time)
            context.textAlign = 'center';
            for (let t = 0; t <= state.tMax; t += Math.ceil(state.tMax / 5)) {
                const { cx } = toCanvas(t, 0);
                context.fillText(t + 's', cx, H - 8);
            }

            // Shaded Area Under Curve (Displacement Δx = Area under v-t)
            context.fillStyle = isLight ? 'rgba(5, 150, 105, 0.15)' : 'rgba(16, 185, 129, 0.2)';
            context.beginPath();
            const { cx: startX } = toCanvas(0, 0);
            context.moveTo(startX, zeroY);
            for (let i = 0; i <= 50; i++) {
                const t = (i / 50) * state.tCurrent;
                const v = getVelocity(t);
                const { cx, cy } = toCanvas(t, v);
                context.lineTo(cx, cy);
            }
            const { cx: endX } = toCanvas(state.tCurrent, 0);
            context.lineTo(endX, zeroY);
            context.closePath();
            context.fill();

            // Full Line (0..tMax)
            context.strokeStyle = isLight ? 'rgba(5, 150, 105, 0.3)' : 'rgba(16, 185, 129, 0.3)';
            context.lineWidth = 2;
            context.setLineDash([3, 3]);
            context.beginPath();
            const pStart = toCanvas(0, state.v0);
            const pEnd = toCanvas(state.tMax, getVelocity(state.tMax));
            context.moveTo(pStart.cx, pStart.cy);
            context.lineTo(pEnd.cx, pEnd.cy);
            context.stroke();
            context.setLineDash([]);

            // Trajectory Line up to tCurrent
            context.strokeStyle = isLight ? '#059669' : '#10b981';
            context.lineWidth = 3;
            context.beginPath();
            const pCur = toCanvas(state.tCurrent, getVelocity(state.tCurrent));
            context.moveTo(pStart.cx, pStart.cy);
            context.lineTo(pCur.cx, pCur.cy);
            context.stroke();

            // Current Pointer Dot
            context.fillStyle = isLight ? '#059669' : '#10b981';
            context.beginPath();
            context.arc(pCur.cx, pCur.cy, 6, 0, Math.PI * 2);
            context.fill();
        }

        // -------------------------------------------------------------
        // Graph 3: a-t (Acceleration - Time)
        // -------------------------------------------------------------
        {
            const canvas = elements.atCanvas;
            const context = ctx.at;
            const { width: W, height: H } = setupHighDPICanvas(canvas, context);

            context.fillStyle = isLight ? '#ffffff' : '#070a10';
            context.fillRect(0, 0, W, H);

            const padL = 45, padR = 15, padT = 20, padB = 30;
            const plotW = W - padL - padR;
            const plotH = H - padT - padB;

            const minA = -12;
            const maxA = 12;
            const yRange = maxA - minA;

            function toCanvas(t, a) {
                const cx = padL + (t / state.tMax) * plotW;
                const cy = padT + plotH - ((a - minA) / yRange) * plotH;
                return { cx, cy };
            }

            // Zero Axis Line (a = 0)
            const zeroY = toCanvas(0, 0).cy;
            context.strokeStyle = axisColor;
            context.lineWidth = 1.5;
            context.beginPath();
            context.moveTo(padL, zeroY);
            context.lineTo(W - padR, zeroY);
            context.stroke();

            // Y ticks
            context.font = '10px "JetBrains Mono", monospace';
            context.fillStyle = textColor;
            context.textAlign = 'right';

            [-10, -5, 0, 5, 10].forEach(aVal => {
                const { cy } = toCanvas(0, aVal);
                context.fillText(aVal + 'm/s²', padL - 4, cy + 3);
            });

            // X ticks (Time)
            context.textAlign = 'center';
            for (let t = 0; t <= state.tMax; t += Math.ceil(state.tMax / 5)) {
                const { cx } = toCanvas(t, 0);
                context.fillText(t + 's', cx, H - 8);
            }

            // Shaded Area Under Curve (Velocity Change Δv = Area under a-t)
            context.fillStyle = isLight ? 'rgba(234, 88, 12, 0.15)' : 'rgba(249, 115, 22, 0.2)';
            const { cx: startX } = toCanvas(0, 0);
            const { cx: endX } = toCanvas(state.tCurrent, 0);
            const { cy: lineY } = toCanvas(0, state.a);

            context.beginPath();
            context.moveTo(startX, zeroY);
            context.lineTo(startX, lineY);
            context.lineTo(endX, lineY);
            context.lineTo(endX, zeroY);
            context.closePath();
            context.fill();

            // Full Constant Line (0..tMax)
            context.strokeStyle = isLight ? 'rgba(234, 88, 12, 0.3)' : 'rgba(249, 115, 22, 0.3)';
            context.lineWidth = 2;
            context.setLineDash([3, 3]);
            context.beginPath();
            const pStart = toCanvas(0, state.a);
            const pEnd = toCanvas(state.tMax, state.a);
            context.moveTo(pStart.cx, pStart.cy);
            context.lineTo(pEnd.cx, pEnd.cy);
            context.stroke();
            context.setLineDash([]);

            // Trajectory up to tCurrent
            context.strokeStyle = isLight ? '#ea580c' : '#f97316';
            context.lineWidth = 3;
            context.beginPath();
            const pCur = toCanvas(state.tCurrent, state.a);
            context.moveTo(pStart.cx, pStart.cy);
            context.lineTo(pCur.cx, pCur.cy);
            context.stroke();

            // Current Pointer Dot
            context.fillStyle = isLight ? '#ea580c' : '#f97316';
            context.beginPath();
            context.arc(pCur.cx, pCur.cy, 6, 0, Math.PI * 2);
            context.fill();
        }
    }

    // --- Master Render Call ---
    function renderAll() {
        updateTelemetryHUD();
        renderSimulationCanvas();
        renderGraphs();
    }

    // --- Animation Loop ---
    function stepAnimation(timestamp) {
        if (!state.isRunning) return;

        if (!state.lastTimestamp) state.lastTimestamp = timestamp;
        const dtReal = (timestamp - state.lastTimestamp) / 1000;
        state.lastTimestamp = timestamp;

        // Advance simulation time according to speed multiplier
        state.tCurrent += dtReal * state.speedMult;

        if (state.tCurrent >= state.tMax) {
            state.tCurrent = state.tMax;
            pauseSimulation();
        }

        renderAll();

        if (state.isRunning) {
            requestAnimationFrame(stepAnimation);
        }
    }

    function startSimulation() {
        if (state.tCurrent >= state.tMax) {
            state.tCurrent = 0;
        }
        state.isRunning = true;
        state.lastTimestamp = 0;
        elements.startBtn.disabled = true;
        elements.pauseBtn.disabled = false;
        requestAnimationFrame(stepAnimation);
    }

    function pauseSimulation() {
        state.isRunning = false;
        elements.startBtn.disabled = false;
        elements.pauseBtn.disabled = true;
    }

    function resetSimulation() {
        pauseSimulation();
        state.tCurrent = 0;
        calculateTurningPoint();
        calculateWorldBounds();
        renderAll();
    }

    // --- Sync Inputs with State ---
    function syncInputs() {
        state.v0 = parseFloat(elements.v0Range.value);
        state.a = parseFloat(elements.aRange.value);
        state.tMax = parseFloat(elements.tRange.value);

        elements.v0Val.textContent = state.v0;
        elements.v0Number.value = state.v0;

        elements.aVal.textContent = state.a;
        elements.aNumber.value = state.a;

        elements.tVal.textContent = state.tMax;
        elements.tNumber.value = state.tMax;

        elements.scrubberRange.max = state.tMax;
        if (state.tCurrent > state.tMax) state.tCurrent = state.tMax;

        calculateTurningPoint();
        calculateWorldBounds();
        renderAll();
    }

    // --- Event Listeners ---

    // Initial Velocity Controls
    elements.v0Range.addEventListener('input', (e) => {
        elements.v0Number.value = e.target.value;
        syncInputs();
    });
    elements.v0Number.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value) || 0;
        val = Math.max(-20, Math.min(20, val));
        elements.v0Range.value = val;
        syncInputs();
    });

    // Acceleration Controls
    elements.aRange.addEventListener('input', (e) => {
        elements.aNumber.value = e.target.value;
        syncInputs();
    });
    elements.aNumber.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value) || 0;
        val = Math.max(-10, Math.min(10, val));
        elements.aRange.value = val;
        syncInputs();
    });

    // Duration Controls
    elements.tRange.addEventListener('input', (e) => {
        elements.tNumber.value = e.target.value;
        syncInputs();
    });
    elements.tNumber.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value) || 1;
        val = Math.max(1, Math.min(20, val));
        elements.tRange.value = val;
        syncInputs();
    });

    // Speed Buttons
    elements.speedGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-speed');
        if (!btn) return;
        document.querySelectorAll('.btn-speed').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.speedMult = parseFloat(btn.dataset.speed);
    });

    // Action Buttons
    elements.startBtn.addEventListener('click', startSimulation);
    elements.pauseBtn.addEventListener('click', pauseSimulation);
    elements.resetBtn.addEventListener('click', resetSimulation);

    // Scrubber Range
    elements.scrubberRange.addEventListener('input', (e) => {
        pauseSimulation();
        state.tCurrent = parseFloat(e.target.value);
        renderAll();
    });

    // Preset Scenario Buttons
    document.querySelectorAll('.scenario-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const v0 = parseFloat(btn.dataset.v0);
            const a = parseFloat(btn.dataset.a);
            const t = parseFloat(btn.dataset.t);

            elements.v0Range.value = v0;
            elements.v0Number.value = v0;
            elements.aRange.value = a;
            elements.aNumber.value = a;
            elements.tRange.value = t;
            elements.tNumber.value = t;

            syncInputs();
            resetSimulation();
        });
    });

    // Theme Switcher
    elements.themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        elements.themeIcon.textContent = isLight ? '☀️' : '🌙';
        renderAll();
    });

    // Handle Window Resize
    window.addEventListener('resize', () => {
        renderAll();
    });

    // --- Initial Launch ---
    syncInputs();
    resetSimulation();
});
