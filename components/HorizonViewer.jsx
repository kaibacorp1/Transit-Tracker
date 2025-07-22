import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, PerspectiveCamera } from "@react-three/drei";
import { useEffect, useState } from "react";
import SunCalc from "suncalc";
import { detectTransits } from "../utils/transitUtils"; // Adjust the path if needed

export default function HorizonViewer({ flights, selectedBody = "sun" }) {
  const [sunPos, setSunPos] = useState({ azimuth: 0, elevation: 0 });
  const [planes, setPlanes] = useState([]);
  const observer = {
    lat: -33.918875,
    lon: 151.197659,
    elev: 13,
  };

  const azElToXYZ = (az, el, radius = 10) => {
    const azRad = (az * Math.PI) / 180;
    const elRad = (el * Math.PI) / 180;
    const r = radius * Math.cos(elRad);
    return [r * Math.sin(azRad), radius * Math.sin(elRad), r * Math.cos(azRad)];
  };

  useEffect(() => {
    const updateSun = () => {
      const now = new Date();
      const pos = selectedBody === "moon"
        ? SunCalc.getMoonPosition(now, observer.lat, observer.lon)
        : SunCalc.getPosition(now, observer.lat, observer.lon);
      setSunPos({
        azimuth: (pos.azimuth * 180) / Math.PI + 180,
        elevation: (pos.altitude * 180) / Math.PI,
      });
    };
    updateSun();
    const interval = setInterval(updateSun, 5000);
    return () => clearInterval(interval);
  }, [selectedBody]);

  useEffect(() => {
    const updatePlanes = () => {
      if (!flights || !Array.isArray(flights)) return;
      const matches = detectTransits({
        flights,
        bodyAz: sunPos.azimuth,
        bodyAlt: sunPos.elevation,
        userLat: observer.lat,
        userLon: observer.lon,
        userElev: observer.elev,
        predictSeconds: 120,
        selectedBody,
        use3DHeading: true,
        useZenithLogic: true,
        useDynamicMargin: true,
        margin: 2.5,
      });

      const updated = matches.map((match) => ({
        id: match.callsign,
        az: parseFloat(match.azimuth),
        el: parseFloat(match.altitudeAngle),
      }));

      setPlanes(updated);
    };

    updatePlanes();
    const interval = setInterval(updatePlanes, 3000);
    return () => clearInterval(interval);
  }, [flights, sunPos, selectedBody]);

  return (
    <div className="w-full h-screen">
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 5, 15]} fov={60} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        <OrbitControls enablePan={false} />

        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[20, 64]} />
          <meshStandardMaterial color="gray" opacity={0.3} transparent />
        </mesh>

        {/* Observer location (Blue Pin) */}
        <mesh position={[0, 0, 0]}>
          <coneGeometry args={[0.2, 0.5, 16]} />
          <meshStandardMaterial color="blue" />
          <Html center>{"👁️ You"}</Html>
        </mesh>

        {/* Sun */}
        <mesh position={azElToXYZ(sunPos.azimuth, sunPos.elevation)}>
          <sphereGeometry args={[0.4, 16, 16]} />
          <meshStandardMaterial emissive="yellow" emissiveIntensity={1} />
          <Html center>{"☀️ Sun"}</Html>
        </mesh>

        {/* Planes */}
        {planes.map((plane) => (
          <mesh key={plane.id} position={azElToXYZ(plane.az, plane.el)}>
            <sphereGeometry args={[0.3, 12, 12]} />
            <meshStandardMaterial color="red" />
            <Html center>{plane.id}</Html>
          </mesh>
        ))}
      </Canvas>
    </div>
  );
}
