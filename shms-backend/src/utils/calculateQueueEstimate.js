/**
 * Calculate the estimated waiting time.
 *
 * @param {number} queuePosition
 * @param {number} averageMinutes
 * @returns {number}
 */
export default function calculateQueueEstimate(
  queuePosition,
  averageMinutes = 15
) {
  return queuePosition * averageMinutes;
}