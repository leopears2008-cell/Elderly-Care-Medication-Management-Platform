/**
 * Google Maps Emergency & 24/7 Pharmacy Navigation Service — SushrutaCare AI
 * Generates senior-friendly deep links and geolocation queries for emergency care.
 */

export interface LocationCoordinates {
  latitude?: number;
  longitude?: number;
}

export class GoogleMapsService {
  private static readonly BASE_SEARCH = 'https://www.google.com/maps/search/';
  private static readonly BASE_DIR = 'https://www.google.com/maps/dir/';

  /**
   * Generates a Google Maps link to locate the nearest 24/7 pharmacies.
   */
  public static getNearbyPharmaciesUrl(coords?: LocationCoordinates): string {
    const query = '24/7 pharmacy chemist medical store';
    if (coords?.latitude && coords?.longitude) {
      return `${this.BASE_SEARCH}?api=1&query=${encodeURIComponent(query)}&query_place_id=${coords.latitude},${coords.longitude}`;
    }
    return `${this.BASE_SEARCH}?api=1&query=${encodeURIComponent(query)}`;
  }

  /**
   * Generates a Google Maps link to locate the nearest emergency hospitals / clinics.
   */
  public static getNearbyHospitalsUrl(coords?: LocationCoordinates): string {
    const query = 'emergency hospital casualty clinic';
    if (coords?.latitude && coords?.longitude) {
      return `${this.BASE_SEARCH}?api=1&query=${encodeURIComponent(query)}&query_place_id=${coords.latitude},${coords.longitude}`;
    }
    return `${this.BASE_SEARCH}?api=1&query=${encodeURIComponent(query)}`;
  }

  /**
   * Generates emergency driving directions to a hospital.
   */
  public static getEmergencyDirectionsUrl(
    hospitalName: string,
    originCoords?: LocationCoordinates
  ): string {
    let url = `${this.BASE_DIR}?api=1&destination=${encodeURIComponent(hospitalName)}&travelmode=driving`;
    if (originCoords?.latitude && originCoords?.longitude) {
      url += `&origin=${originCoords.latitude},${originCoords.longitude}`;
    }
    return url;
  }
}
