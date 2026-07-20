import ActivityKit
import ExpoModulesCore

// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SHARED CONTRACT — keep byte-identical with                               ║
// ║  targets/workout/WorkoutAttributes.swift                                  ║
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

public class WorkoutActivityModule: Module {
  // Typed as Any so the stored property compiles below iOS 16.2.
  private var currentActivity: Any?

  public func definition() -> ModuleDefinition {
    Name("ExpoWorkoutActivity")

    Function("areActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("start") { (activityType: String, startedAtMs: Double) -> Bool in
      guard #available(iOS 16.2, *) else { return false }

      // Only one workout runs at a time — replace any stale activity.
      if let existing = self.currentActivity as? Activity<WorkoutAttributes> {
        await existing.end(nil, dismissalPolicy: .immediate)
        self.currentActivity = nil
      }

      let attributes = WorkoutAttributes(
        activityType: activityType,
        startedAt: Date(timeIntervalSince1970: startedAtMs / 1_000)
      )
      let initialState = WorkoutAttributes.ContentState(
        distanceMeters: 0,
        paceSecPerKm: 0,
        offRoute: false
      )

      do {
        let activity = try Activity.request(
          attributes: attributes,
          content: ActivityContent(state: initialState, staleDate: nil)
        )
        self.currentActivity = activity
        return true
      } catch {
        return false
      }
    }

    AsyncFunction("update") { (distanceM: Double, paceSecPerKm: Double, offRoute: Bool) in
      guard #available(iOS 16.2, *),
            let activity = self.currentActivity as? Activity<WorkoutAttributes> else { return }

      let state = WorkoutAttributes.ContentState(
        distanceMeters: distanceM,
        paceSecPerKm: paceSecPerKm,
        offRoute: offRoute
      )
      await activity.update(ActivityContent(state: state, staleDate: nil))
    }

    AsyncFunction("end") { (distanceM: Double, paceSecPerKm: Double) in
      guard #available(iOS 16.2, *),
            let activity = self.currentActivity as? Activity<WorkoutAttributes> else { return }

      let finalState = WorkoutAttributes.ContentState(
        distanceMeters: distanceM,
        paceSecPerKm: paceSecPerKm,
        offRoute: false
      )
      await activity.end(
        ActivityContent(state: finalState, staleDate: nil),
        dismissalPolicy: .immediate
      )
      self.currentActivity = nil
    }
  }
}
