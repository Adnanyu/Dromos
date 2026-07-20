import ActivityKit
import SwiftUI
import WidgetKit

@main
struct WorkoutWidgets: WidgetBundle {
  var body: some Widget {
    WorkoutLiveActivity()
  }
}

// ── Formatting helpers ───────────────────────────────────────────────────────

private func formatDistance(_ meters: Double) -> String {
  if meters >= 1_000 {
    return String(format: "%.2f km", meters / 1_000)
  }
  return String(format: "%.0f m", meters)
}

private func formatPace(_ secPerKm: Double) -> String {
  guard secPerKm > 0, secPerKm.isFinite else { return "--:--" }
  let minutes = Int(secPerKm) / 60
  let seconds = Int(secPerKm) % 60
  return String(format: "%d:%02d /km", minutes, seconds)
}

private func activitySymbol(_ type: String) -> String {
  switch type {
  case "cycling": return "figure.outdoor.cycle"
  case "hiking":  return "figure.hiking"
  default:        return "figure.run"
  }
}

private let brandColor = Color(red: 0x0D / 255, green: 0x7C / 255, blue: 0x66 / 255)

// ── Live Activity ────────────────────────────────────────────────────────────
// The same ActivityConfiguration powers every presentation: iOS shows the
// Dynamic Island on supported iPhones and the lock-screen card everywhere
// else — no per-device code needed. The elapsed timer renders natively via
// Text(_, style: .timer), so it ticks with zero updates from the app.

struct WorkoutLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: WorkoutAttributes.self) { context in
      // Lock-screen / banner card
      LockScreenView(context: context)
        .activityBackgroundTint(Color(red: 0x07 / 255, green: 0x11 / 255, blue: 0x1F / 255))
        .activitySystemActionForegroundColor(brandColor)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 2) {
            Label(formatDistance(context.state.distanceMeters), systemImage: activitySymbol(context.attributes.activityType))
              .font(.title3.bold())
              .foregroundStyle(brandColor)
            Text("Distance")
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .trailing, spacing: 2) {
            Text(formatPace(context.state.paceSecPerKm))
              .font(.title3.bold())
              .foregroundStyle(.primary)
            Text("Pace")
              .font(.caption2)
              .foregroundStyle(.secondary)
          }
          .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            Image(systemName: "stopwatch")
              .foregroundStyle(.secondary)
            Text(context.attributes.startedAt, style: .timer)
              .font(.headline.monospacedDigit())
            if context.state.offRoute {
              Spacer()
              Label("Off route", systemImage: "exclamationmark.triangle.fill")
                .font(.caption.bold())
                .foregroundStyle(.yellow)
            }
          }
          .padding(.horizontal, 4)
        }
      } compactLeading: {
        Image(systemName: activitySymbol(context.attributes.activityType))
          .foregroundStyle(brandColor)
      } compactTrailing: {
        Text(formatDistance(context.state.distanceMeters))
          .font(.caption2.monospacedDigit())
          .foregroundStyle(brandColor)
      } minimal: {
        Image(systemName: activitySymbol(context.attributes.activityType))
          .foregroundStyle(brandColor)
      }
    }
  }
}

// ── Lock-screen card ─────────────────────────────────────────────────────────

struct LockScreenView: View {
  let context: ActivityViewContext<WorkoutAttributes>

  var body: some View {
    VStack(spacing: 10) {
      HStack {
        Label("Dromos", systemImage: activitySymbol(context.attributes.activityType))
          .font(.caption.bold())
          .foregroundStyle(brandColor)
        Spacer()
        if context.state.offRoute {
          Label("Off route", systemImage: "exclamationmark.triangle.fill")
            .font(.caption2.bold())
            .foregroundStyle(.yellow)
        }
      }

      HStack(alignment: .firstTextBaseline) {
        StatColumn(value: formatDistance(context.state.distanceMeters), label: "Distance", emphasized: true)
        Spacer()
        StatColumn(value: formatPace(context.state.paceSecPerKm), label: "Pace", emphasized: false)
        Spacer()
        VStack(alignment: .trailing, spacing: 2) {
          Text(context.attributes.startedAt, style: .timer)
            .font(.title3.bold().monospacedDigit())
            .foregroundStyle(.white)
          Text("Time")
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
      }
    }
    .padding(14)
  }
}

struct StatColumn: View {
  let value: String
  let label: String
  let emphasized: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(value)
        .font(.title3.bold().monospacedDigit())
        .foregroundStyle(emphasized ? brandColor : .white)
      Text(label)
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
  }
}
