export const STANDARD_PATRIMONY_PATTERN = /^\d{6}$/;
export const FLEET_NUMBER_PATTERN = /^\d{1,10}$/;
export const FLEET_PATRIMONY_PATTERN = /^\d{1,10}\.0$/;

export function isStandardPatrimonyId(value) {
  return STANDARD_PATRIMONY_PATTERN.test(String(value ?? "").trim());
}

export function isFleetPatrimonyId(value) {
  return FLEET_PATRIMONY_PATTERN.test(String(value ?? "").trim());
}

export function isOfficialPatrimonyId(value) {
  return isStandardPatrimonyId(value) || isFleetPatrimonyId(value);
}

export function isAssetIdentifierValidForType(value, type) {
  return type === "fleet"
    ? isFleetPatrimonyId(value)
    : isStandardPatrimonyId(value);
}

export function toFleetPatrimonyId(value) {
  const fleetNumber = String(value ?? "").trim();
  return FLEET_NUMBER_PATTERN.test(fleetNumber) ? `${fleetNumber}.0` : null;
}

export function fleetNumberFromPatrimonyId(value) {
  const identifier = String(value ?? "").trim();
  return isFleetPatrimonyId(identifier) ? identifier.slice(0, -2) : null;
}
