const fs = require('fs');
const file = 'client/src/components/pages/TrackManagerPage.jsx';
let content = fs.readFileSync(file, 'utf8');

const eventHandlers = `
  const getClosestPointIndex = (clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas || !mapContextRef.current) return -1;
    const rect = canvas.getBoundingClientRect();
    const pixelX = clientX - rect.left;
    const pixelY = clientY - rect.top;
    
    const { minX, minZ, maxZ, sc, ox, oz, points } = mapContextRef.current;
    if (!points || points.length === 0) return -1;
    
    // Reverse map from pixel to world
    const sx = (pixelX - transform.x) / transform.scale;
    const sy = (pixelY - transform.y) / transform.scale;
    const worldX = (sx - ox) / sc + minX;
    const worldZ = maxZ - (sy - oz) / sc;
    
    let closestIdx = -1;
    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x - worldX;
      const dz = points[i].z - worldZ;
      const dist = dx * dx + dz * dz;
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }
    return { closestIdx, sx, sy };
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    
    if (editingTurnIndex !== null && editTurnForm && mapContextRef.current) {
      const { toScreen, points } = mapContextRef.current;
      const { closestIdx, sx, sy } = getClosestPointIndex(e.clientX, e.clientY);
      
      const sPt = points[editTurnForm.startIdx];
      const ePt = points[editTurnForm.endIdx];
      if (sPt && ePt) {
        const sScreen = toScreen(sPt);
        const eScreen = toScreen(ePt);
        
        const distToStart = Math.hypot(sScreen.sx - sx, sScreen.sy - sy);
        const distToEnd = Math.hypot(eScreen.sx - sx, eScreen.sy - sy);
        
        const hitRadius = 15 / transform.scale;
        
        if (distToStart < hitRadius) {
          setDragMode('start');
          return;
        } else if (distToEnd < hitRadius) {
          setDragMode('end');
          return;
        }
      }
    }
    
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handleMouseMove = (e) => {
    if (dragMode) {
      const { closestIdx } = getClosestPointIndex(e.clientX, e.clientY);
      if (closestIdx !== -1 && editTurnForm) {
        if (dragMode === 'start' && closestIdx < editTurnForm.endIdx) {
          setEditTurnForm(prev => ({ ...prev, startIdx: closestIdx }));
        } else if (dragMode === 'end' && closestIdx > editTurnForm.startIdx) {
          setEditTurnForm(prev => ({ ...prev, endIdx: closestIdx }));
        }
      }
      return;
    }

    if (isDragging) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }));
    }
  };

  const handleMouseUp = async (e) => {
    if (dragMode) {
      setDragMode(null);
      
      // Auto save bounds!
      if (editTurnForm && selectedTrack && editingTurnIndex !== null) {
         try {
           const res = await fetch(\`/api/tracks/\${selectedTrack}/turns/\${editingTurnIndex}/bounds\`, {
             method: 'PUT',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ startIdx: editTurnForm.startIdx, endIdx: editTurnForm.endIdx })
           });
           if (res.ok) {
             const data = await res.json();
             updateSelectedTrackTurns(data.turns);
             toast('弯道边界已更新', 'success');
           }
         } catch (err) {
           console.error(err);
         }
      }
      return;
    }
    setIsDragging(false);
  };

  const handleDoubleClick = async (e) => {
    if (editingTurnIndex === null || !selectedTrack) return;
    const { closestIdx } = getClosestPointIndex(e.clientX, e.clientY);
    if (closestIdx !== -1 && editTurnForm) {
       // Check if click is inside the current turn
       if (closestIdx >= editTurnForm.startIdx && closestIdx <= editTurnForm.endIdx) {
          if (!window.confirm(\`确认在此处拆分弯道吗？\`)) return;
          try {
            const res = await fetch(\`/api/tracks/\${selectedTrack}/turns/split\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ turnIndex: editingTurnIndex, splitIdx: closestIdx })
            });
            if (res.ok) {
              const data = await res.json();
              updateSelectedTrackTurns(data.turns);
              setEditingTurnIndex(null);
              setEditTurnForm(null);
              toast('弯道拆分成功', 'success');
            } else {
              toast('拆分失败: ' + (await res.json()).error, 'error');
            }
          } catch(err) {
             console.error(err);
          }
       }
    }
  };
`;

content = content.replace(/const handleMouseDown = \(e\) => \{[\s\S]*?setIsDragging\(false\);\n  \};/, eventHandlers);
content = content.replace('onMouseUp={handleMouseUp}', 'onMouseUp={handleMouseUp}\n                onDoubleClick={handleDoubleClick}');
content = content.replace(/body: JSON\.stringify\(\{ turnIndex: editingTurnIndex \}\)/, 'body: JSON.stringify({ turnIndex: editingTurnIndex, splitIdx: apexIndex })'); // Fallback if old split turn is used

fs.writeFileSync(file, content);
console.log('Events patched');
