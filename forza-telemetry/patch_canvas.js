const fs = require('fs');
const file = 'client/src/components/pages/TrackManagerPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// Add mapContextRef
content = content.replace('const canvasRef = useRef(null);', 'const canvasRef = useRef(null);\n  const mapContextRef = useRef({});\n  const [dragMode, setDragMode] = useState(null); // null, "start", "end"');

// Update drawTrack to save mapContextRef and draw handles
content = content.replace(
  'const isLoop = track.isLoop === true;',
  `const isLoop = track.isLoop === true;
    
    // Save to ref for interactions
    if (mapContextRef) {
      mapContextRef.current = {
        minX, minZ, maxZ, sc, ox, oz,
        points: track.centerline || track.points || [],
        toScreen
      };
    }`
);

// Draw handles for editingTurnIndex
const drawHandles = `
      // --- START EDIT ---
      // Draw drag handles
      if (isEditing) {
        let actualStartIdx = turn.startIdx;
        let actualEndIdx = turn.endIdx;
        if (editTurnForm) {
          actualStartIdx = editTurnForm.startIdx;
          actualEndIdx = editTurnForm.endIdx;
        }
        const sPoint = track.centerline ? track.centerline[actualStartIdx] : points[actualStartIdx];
        const ePoint = track.centerline ? track.centerline[actualEndIdx] : points[actualEndIdx];
        
        if (sPoint && ePoint) {
          const sPos = toScreen(sPoint);
          const ePos = toScreen(ePoint);
          
          // Start Handle (Yellow)
          ctx.beginPath();
          ctx.arc(sPos.sx, sPos.sy, 8 / transform.scale, 0, 2*Math.PI);
          ctx.fillStyle = '#d29922';
          ctx.fill();
          ctx.lineWidth = 2 / transform.scale;
          ctx.strokeStyle = '#fff';
          ctx.stroke();

          // End Handle (Red)
          ctx.beginPath();
          ctx.arc(ePos.sx, ePos.sy, 8 / transform.scale, 0, 2*Math.PI);
          ctx.fillStyle = '#f85149';
          ctx.fill();
          ctx.stroke();
        }
      }
      // --- END EDIT ---
`;
content = content.replace('// 3. 绘制刹车点', drawHandles + '\n      // 3. 绘制刹车点');

fs.writeFileSync(file, content);
console.log('Canvas patched');
