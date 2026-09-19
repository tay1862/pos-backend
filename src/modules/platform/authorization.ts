export interface LocationAccessSubject {
  isOwner: boolean;
  assignedLocationIds: readonly string[];
}

export function canAccessLocation(subject: LocationAccessSubject, locationId: string): boolean {
  return subject.isOwner || subject.assignedLocationIds.includes(locationId);
}
