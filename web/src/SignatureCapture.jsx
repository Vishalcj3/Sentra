import React, { useRef, useState, useEffect } from "react";

export default function SignatureCapture({ onCapture, onCancel, referenceUrl }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#1E293B";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const start = (e) => {
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
    setIsEmpty(false);
  };

  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const end = () => setDrawing(false);

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const capture = () => {
    canvasRef.current.toBlob((blob) => onCapture(blob), "image/png");
  };

  return (
    <div className="sig-container">
      {referenceUrl && (
        <div style={{ width: "100%" }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 500 }}>
            Your registered signature (for reference)
          </p>
          <div className="sig-reference">
            <img src={referenceUrl} alt="Registered signature" />
            <div className="sig-reference-label">Registered signature</div>
          </div>
        </div>
      )}

      <p className="sig-label">
        {referenceUrl ? "Re-sign below to confirm your identity" : "Draw your signature below"}
      </p>

      <div className="sig-canvas-wrap" style={{ width: "100%" }}>
        <canvas
          ref={canvasRef}
          width={400}
          height={160}
          className="sig-canvas"
          style={{ width: "100%", height: 160 }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        <div className="sig-baseline" />
      </div>

      <div className="sig-actions">
        <button className="ghost" onClick={clear}>Clear</button>
        <button className="primary" disabled={isEmpty} onClick={capture}>
          ✓ Confirm Signature
        </button>
      </div>

      {onCancel && (
        <button className="link-btn" onClick={onCancel}>
          Use PIN instead
        </button>
      )}
    </div>
  );
}
