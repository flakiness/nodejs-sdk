
export type TelemetryPoint = {
  timestamp: number,
  value: number, // percentage, 0-100
};

export function addTelemetryPoint(collection: TelemetryPoint[], newPoint: TelemetryPoint, precision: number) {
  const lastPoint = collection.at(-1);
  const preLastPoint = collection.at(-2);
  if (lastPoint &&
      preLastPoint &&
      Math.abs(lastPoint.value - preLastPoint.value) < precision &&
      Math.abs(lastPoint.value - newPoint.value) < precision
  ) {
    lastPoint.timestamp = newPoint.timestamp;
  } else {
    collection.push(newPoint);
  }
}

export function toProtocolTelemetry(collection: TelemetryPoint[]): [number, number][] {
  if (!collection.length)
    return [];
  let lastTimestamp = collection[0].timestamp;
  return collection.map((x, idx) => {
    const dts = idx === 0 ? x.timestamp : x.timestamp - lastTimestamp;
    lastTimestamp = x.timestamp;
    return [dts, Math.round(x.value * 100) / 100];
  });
}


