# CONTEXT

**Current Task**: Fixed false partly-cloudy/cloudy reports on visually clear days (esp. mornings).

**Key Decisions**:
- Hold last solar cloud cover at night/dawn; do not fall back to dew-point heuristic.
- Scale learned bucket max to current elevation; treat max as outlier (0.88); discount Haurwitz (0.82).
- Heuristic only maps near-saturation to clouds (clear at ≥5 °C depression).

**Next Steps**:
- Verify on a live clear morning (`calculated.cloudCoverModel` should stay `solar`).
- Watch `calculated.clearSkyReference` after a few clear days.
