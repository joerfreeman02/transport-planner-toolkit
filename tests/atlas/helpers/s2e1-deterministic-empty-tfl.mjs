/** Return successful empty responses for TfL APIs during national-only diagnostics. */
export function createDeterministicEmptyTflFetch({ requests = [] } = {}) {
  return async input => {
    const url = new URL(String(input));
    const pathname = url.pathname;
    requests.push(pathname);
    let body;
    if (pathname === '/StopPoint') {
      body = { stopPoints: [] };
    } else if (/\/Line\/[^/]+\/Route\/Sequence\/[^/]+$/.test(pathname)) {
      const match = pathname.match(/\/Line\/([^/]+)\/Route\/Sequence\/([^/]+)$/);
      body = { lineId: decodeURIComponent(match[1]), direction: decodeURIComponent(match[2]), stopPointSequences: [] };
    } else if (/\/Line\/[^/]+\/Route$/.test(pathname)) {
      body = [];
    } else {
      const timetable = pathname.match(/\/Line\/([^/]+)\/Timetable\/([^/]+)$/);
      if (!timetable) throw new Error(`Unexpected TfL endpoint in deterministic diagnostic: ${pathname}`);
      const lineId = decodeURIComponent(timetable[1]);
      const stopPointId = decodeURIComponent(timetable[2]);
      body = { lineId, lineName: lineId, direction: 'outbound', stations: [], timetable: { departureStopId: stopPointId, routes: [] } };
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}
