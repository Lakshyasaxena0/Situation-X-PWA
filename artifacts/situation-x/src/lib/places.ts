/** A short list of cities so people can pick a place without typing coordinates. */
export type Place = { name: string; latitude: number; longitude: number };

export const PLACES: Place[] = [
  { name: "New Delhi, India", latitude: 28.6139, longitude: 77.209 },
  { name: "Mumbai, India", latitude: 19.076, longitude: 72.8777 },
  { name: "Kolkata, India", latitude: 22.5726, longitude: 88.3639 },
  { name: "Chennai, India", latitude: 13.0827, longitude: 80.2707 },
  { name: "Bengaluru, India", latitude: 12.9716, longitude: 77.5946 },
  { name: "Hyderabad, India", latitude: 17.385, longitude: 78.4867 },
  { name: "Ahmedabad, India", latitude: 23.0225, longitude: 72.5714 },
  { name: "Pune, India", latitude: 18.5204, longitude: 73.8567 },
  { name: "Jaipur, India", latitude: 26.9124, longitude: 75.7873 },
  { name: "Lucknow, India", latitude: 26.8467, longitude: 80.9462 },
  { name: "Kanpur, India", latitude: 26.4499, longitude: 80.3319 },
  { name: "Patna, India", latitude: 25.5941, longitude: 85.1376 },
  { name: "Bhopal, India", latitude: 23.2599, longitude: 77.4126 },
  { name: "Indore, India", latitude: 22.7196, longitude: 75.8577 },
  { name: "Chandigarh, India", latitude: 30.7333, longitude: 76.7794 },
  { name: "Varanasi, India", latitude: 25.3176, longitude: 82.9739 },
  { name: "Dubai, UAE", latitude: 25.2048, longitude: 55.2708 },
  { name: "London, UK", latitude: 51.5074, longitude: -0.1278 },
  { name: "New York, USA", latitude: 40.7128, longitude: -74.006 },
  { name: "San Francisco, USA", latitude: 37.7749, longitude: -122.4194 },
  { name: "Toronto, Canada", latitude: 43.6532, longitude: -79.3832 },
  { name: "Singapore", latitude: 1.3521, longitude: 103.8198 },
  { name: "Sydney, Australia", latitude: -33.8688, longitude: 151.2093 },
  { name: "Kathmandu, Nepal", latitude: 27.7172, longitude: 85.324 },
  { name: "Dhaka, Bangladesh", latitude: 23.8103, longitude: 90.4125 },
  { name: "Karachi, Pakistan", latitude: 24.8607, longitude: 67.0011 },
];

export const DEFAULT_PLACE = PLACES[0];

export function validCoords(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}
