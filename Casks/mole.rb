cask "mole" do
  arch arm: "arm64", intel: "amd64"

  version "0.1.16"
  sha256 arm: "9806bbfcef1f1305fff3f686a7acbebd67ca11cd0e629979ac5f979bf1549358", intel: "be90bcbb1b3362b56edecc57743391ce6ff2606e638aae9346796f1de74ae3c7"

  url "https://github.com/itcuihao/mole/releases/download/v#{version}/Mole-v#{version}-macos-#{arch}.zip"
  name "Mole"
  desc "Terminal workspace manager for profiles, hosts, and commands"
  homepage "https://github.com/itcuihao/mole"

  depends_on formula: "tmux"

  app "Mole.app"

  zap trash: [
    "~/.config/mole",
  ]
end
