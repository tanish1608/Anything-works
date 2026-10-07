import SwiftUI

/// Matches the PM website's dark workspace.
enum Theme {
    static let background = Color(red: 0x10 / 255, green: 0x1a / 255, blue: 0x28 / 255)
    static let panel = Color(red: 0x18 / 255, green: 0x25 / 255, blue: 0x35 / 255)
    static let border = Color(red: 0x2d / 255, green: 0x3e / 255, blue: 0x52 / 255)
    static let secondary = Color(red: 0x98 / 255, green: 0xaa / 255, blue: 0xbd / 255)
    static let accent = Color(red: 0x5f / 255, green: 0xa9 / 255, blue: 0xff / 255)

    static func statusColor(_ status: String) -> Color {
        switch status {
        case "ai", "human": return .green
        case "issue": return .red
        case "review", "evidence": return .orange
        default: return secondary
        }
    }
}

struct StatusChip: View {
    let item: CrewItem
    var body: some View {
        Label(item.statusLabel, systemImage: item.status == "issue" ? "exclamationmark.triangle.fill"
              : ["ai", "human"].contains(item.status) ? "checkmark.seal.fill" : "clock")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Theme.statusColor(item.status))
    }
}
