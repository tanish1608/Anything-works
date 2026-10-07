import SwiftUI

/// The assistant character (Timber, from the design iteration) next to anything the AI says.
struct BeaverSays<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image("WorksBeaver").resizable().scaledToFill().frame(width: 40, height: 40).clipShape(Circle())
                .accessibilityLabel("Timber")
            VStack(alignment: .leading, spacing: 4) {
                Text("Timber").font(.caption.bold()).foregroundStyle(Theme.accent)
                content
            }
        }
    }
}
