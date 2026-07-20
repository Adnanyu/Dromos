import ActivityKit
import Foundation

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SHARED CONTRACT — keep byte-identical with                               ║
// ║  modules/expo-workout-activity/ios/WorkoutActivityModule.swift            ║
// ║  ActivityKit matches app ↔ widget by the Codable shape of this struct.    ║
// ║  If the two copies drift, Live Activity updates silently stop applying.  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
struct WorkoutAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var distanceMeters: Double
    var paceSecPerKm: Double
    var offRoute: Bool
  }

  var activityType: String
  var startedAt: Date
}
