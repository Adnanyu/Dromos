export function destinationPoint(
  startLat: number,
  startLng: number,
  distanceMeters: number,
  bearingDegrees: number
) {
  const earthRadius = 6371000;

  const startLatRad = (startLat * Math.PI) / 180;
  const startLngRad = (startLng * Math.PI) / 180;
  const bearingRad = (bearingDegrees * Math.PI) / 180;

  const angularDistance = distanceMeters / earthRadius;

  const endLatRad = Math.asin(
    Math.sin(startLatRad) * Math.cos(angularDistance) +
    Math.cos(startLatRad) *
      Math.sin(angularDistance) *
      Math.cos(bearingRad)
  );

  const endLngRad =
    startLngRad +
    Math.atan2(
      Math.sin(bearingRad) *
        Math.sin(angularDistance) *
        Math.cos(startLatRad),
      Math.cos(angularDistance) -
        Math.sin(startLatRad) * Math.sin(endLatRad)
    );

  return {
    lat: (endLatRad * 180) / Math.PI,
    lng: ((endLngRad * 180) / Math.PI + 540) % 360 - 180,
  };
}