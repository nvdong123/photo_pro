import { useState, useEffect, useRef } from 'react';
import { subscribeLocationStream, subscribeStaffStream, type PhotoEvent, type StaffPhotoEvent } from '../services/sseService';

export function usePhotoStream(locationId: string | null) {
  const [photos, setPhotos] = useState<PhotoEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!locationId) return;

    setIsConnected(true);
    cleanupRef.current = subscribeLocationStream(
      locationId,
      (event) => setPhotos((prev) => [event, ...prev]),
      () => setIsConnected(false),
    );

    return () => {
      cleanupRef.current?.();
      setIsConnected(false);
    };
  }, [locationId]);

  return { photos, isConnected };
}

export function useStaffStream() {
  const [events, setEvents] = useState<StaffPhotoEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setIsConnected(true);
    cleanupRef.current = subscribeStaffStream(
      (event) => setEvents((prev) => [event, ...prev]),
      () => setIsConnected(false),
    );

    return () => {
      cleanupRef.current?.();
      setIsConnected(false);
    };
  }, []);

  return { events, isConnected };
}
