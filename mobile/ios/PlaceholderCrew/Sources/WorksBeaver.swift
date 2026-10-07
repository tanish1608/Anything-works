import SwiftUI

/// The assistant character (Works Beaver, from the design iteration) next to anything the AI says.
struct BeaverSays<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image("WorksBeaver").resizable().scaledToFill().frame(width: 40, height: 40).clipShape(Circle())
                .accessibilityLabel("Works Beaver")
            VStack(alignment: .leading, spacing: 4) {
                Text("Works Beaver").font(.caption.bold()).foregroundStyle(Theme.accent)
                content
            }
        }
    }
}
