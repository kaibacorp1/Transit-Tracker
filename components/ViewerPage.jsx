import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import SunCalc from 'suncalc';

const HorizonViewer = dynamic(() => import('./HorizonViewer'), { ssr: false });

export default function ViewerPage() {
  // 👤 Your observer location (Sydney default for testing)
  const userLocation = {
    lat: -33.918875,
    lon: 151.197659,
    elev: 13
  };

  // ☀️ Sun position calculation
  const now = new Date();
  const sunPos = SunCalc.getPosition(now, userLocation.lat, userLocation.lon);
  const bodyAz = (sunPos.azimuth * 180 / Math.PI + 180) % 360;
  const bodyAlt = sunPos.altitude * 180 / Math.PI;

  // ✈️ Live flight data placeholder
  const [flights, setFlights] = useState([]);

  // ⏱ Fetch from your backend or API here
  useEffect(() => {
    const fetchFlights = async () => {
      try {
        const res = await fetch('/api/flights'); // 🔁 Replace with real endpoint
        const data = await res.json();
        setFlights(data.flights || []);
      } catch (err) {
        console.error('Failed to fetch flights:', err);
      }
    };

    fetchFlights();
    const interval = setInterval(fetchFlights, 10000); // Refresh every 10 sec
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', backgroundColor: '#111' }}>
      <HorizonViewer
        flights={flights}
        userLocation={userLocation}
        bodyAz={bodyAz}
        bodyAlt={bodyAlt}
      />
    </div>
  );
}
