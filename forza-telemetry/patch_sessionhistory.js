const fs = require('fs');
const file = 'client/src/components/pages/SessionHistoryPage.jsx';
let content = fs.readFileSync(file, 'utf8');

// Add vehiclesList state
content = content.replace(
  'const [sessions, setSessions] = useState([]);',
  'const [sessions, setSessions] = useState([]);\n  const [vehiclesList, setVehiclesList] = useState({});'
);

// Load vehicles on mount
const loadVehiclesEffect = `
  useEffect(() => {
    fetch('/api/vehicles')
      .then(r => r.json())
      .then(data => setVehiclesList(data))
      .catch(console.error);
  }, []);
`;
content = content.replace(
  'useEffect(() => {',
  loadVehiclesEffect + '\n  useEffect(() => {'
);

// Replace entry.vehicleName and session.vehicle?.name with vehiclesList lookup
content = content.replace(
  /entry\.vehicleName/g,
  "(vehiclesList[entry.vehicleOrdinal]?.name || entry.vehicleName)"
);

content = content.replace(
  /session\.vehicle\?\.name/g,
  "(vehiclesList[session.vehicle?.ordinal]?.name || session.vehicle?.name)"
);

content = content.replace(
  /e\.vehicleName/g,
  "(vehiclesList[e.vehicleOrdinal]?.name || e.vehicleName)"
);

content = content.replace(
  /v\.vehicleName/g,
  "(vehiclesList[v.vehicleOrdinal]?.name || v.vehicleName)"
);

content = content.replace(
  /top3\[(\d+)\]\.vehicleName/g,
  "(vehiclesList[top3[$1].vehicleOrdinal]?.name || top3[$1].vehicleName)"
);

fs.writeFileSync(file, content);
console.log('SessionHistoryPage patched');
