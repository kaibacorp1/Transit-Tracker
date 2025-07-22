import HorizonViewer from './HorizonViewer';
import { detectTransits } from '../utils/transitUtils';

export default function ViewerPage({ flights, userLocation }) {
  const matches = detectTransits({
    flights,
    bodyAz: 297.5, // Replace with actual sun azimuth
    bodyAlt: 2.3,   // Replace with actual sun altitude
    userLat: userLocation.lat,
    userLon: userLocation.lon,
    userElev: userLocation.elev,
    predictSeconds: 120,
    selectedBody: 'sun',
    margin: 2.5,
    use3DHeading: true
  });

  return (
    <div style={{ height: '100vh' }}>
      <HorizonViewer
        flights={flights}
        matches={matches}
        userLocation={userLocation}
      />
    </div>
  );
}
