async function main() {
  try {
    const res = await fetch('http://localhost:9188/api/current');
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error fetching data:', e.message);
  }
}
main();
