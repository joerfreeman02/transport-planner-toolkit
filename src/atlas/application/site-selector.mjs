import { confirmSite, createSite, setAssessmentPoint, SITE_LOCATION_METHODS } from '../domain/site.mjs';

function validCandidate(site) {
  if (!site || site.validation?.state === 'invalid') throw new Error('Choose a valid location before continuing.');
  return site;
}

export function createSiteSelector({ clock = () => new Date(), onChange = () => {} } = {}) {
  let site = null;
  let revision = 0;

  const publish = reason => {
    revision += 1;
    const snapshot = getSnapshot();
    onChange(Object.freeze({ ...snapshot, reason }));
    return snapshot;
  };

  function getSnapshot() {
    return Object.freeze({
      site,
      confirmedSite: site?.validation?.state === 'confirmed' ? site : null,
      isConfirmed: site?.validation?.state === 'confirmed',
      revision
    });
  }

  function selectCandidate(candidate) {
    site = validCandidate(candidate);
    publish('candidate_selected');
    return site;
  }

  function setPoint({ latitude, longitude, method, suppliedAddress, displayAddress } = {}) {
    if (site) {
      site = validCandidate(setAssessmentPoint(site, { latitude, longitude, method }));
    } else {
      site = validCandidate(createSite({
        suppliedAddress,
        displayAddress: displayAddress || suppliedAddress,
        latitude,
        longitude,
        locationMethod: method
      }));
    }
    publish('assessment_point_changed');
    return site;
  }

  function chooseOnMap(input) {
    const method = site?.geocoding?.source ? SITE_LOCATION_METHODS.PLANNER_ADJUSTED : SITE_LOCATION_METHODS.MAP_SELECTED;
    return setPoint({ ...input, method });
  }

  function enterCoordinates(input) {
    return setPoint({ ...input, method: SITE_LOCATION_METHODS.COORDINATES_ENTERED });
  }

  function confirm() {
    site = confirmSite(validCandidate(site), { confirmedAt: clock().toISOString() });
    publish('assessment_point_confirmed');
    return site;
  }

  function reset() {
    site = null;
    publish('selection_reset');
  }

  return Object.freeze({ getSnapshot, selectCandidate, chooseOnMap, enterCoordinates, confirm, reset });
}
