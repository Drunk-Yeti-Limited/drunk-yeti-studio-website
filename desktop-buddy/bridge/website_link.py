"""Buddy menu adapter. The listener starts only after explicit enablement."""
from PySide6.QtCore import QTimer, QUrl, Qt
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import QDialog,QVBoxLayout,QLabel,QPushButton,QLineEdit,QApplication
from web_bridge import Bridge


def available(b):
    return bool(b.isVisible() and not b.presenting and not b.care.asleep and
                not b.quiet and b.focus_end is None and not b.party_play_active and
                not b.break_coach.active and b.drag_origin is None)


class WebsiteLink(QDialog):
    def __init__(self,b):
        super().__init__()
        self.b = b
        self.bridge = None
        self.setWindowTitle('Drunk Yeti · Website link')
        self.resize(540,430)
        layout = QVBoxLayout(self)
        title = QLabel('Bring your Yeti to the website')
        title.setStyleSheet('font-size:22px;font-weight:bold')
        layout.addWidget(title)
        help_text = QLabel('Connect this computer to drunkyetistudio.com for waves, surprised reactions and a little snow on the page. No account sign-in, passwords, files or desktop commands are shared. Pairing lasts 30 minutes and ends when you close this window.')
        help_text.setWordWrap(True)
        layout.addWidget(help_text)
        self.enable = QPushButton('Enable website link for 30 minutes')
        self.enable.clicked.connect(self.start)
        layout.addWidget(self.enable)
        self.code = QLineEdit()
        self.code.setReadOnly(True)
        self.code.setAccessibleName('Website pairing code')
        self.code.setPlaceholderText('Enable the link to create a pairing code')
        layout.addWidget(self.code)
        copy = QPushButton('Copy pairing code')
        copy.clicked.connect(lambda: QApplication.clipboard().setText(self.code.text()) if self.bridge else None)
        layout.addWidget(copy)
        open_page = QPushButton('Open the official connection page')
        open_page.clicked.connect(lambda:QDesktopServices.openUrl(QUrl('https://www.drunkyetistudio.com/desktop-buddy/')))
        layout.addWidget(open_page)
        for kind,label in [('wave','Wave at the webpage'),('snow','Send snow to the webpage')]:
            btn = QPushButton(label)
            btn.clicked.connect(lambda _checked=False,k=kind:self.send(k))
            layout.addWidget(btn)
        self.status = QLabel('Link is off. The website cannot detect Buddy until you connect.')
        self.status.setWordWrap(True)
        self.status.setTextFormat(Qt.PlainText)
        layout.addWidget(self.status)
        stop = QPushButton('Disconnect and close')
        stop.clicked.connect(self.close)
        layout.addWidget(stop)
        self.timer = QTimer(self)
        self.timer.setInterval(250)
        self.timer.timeout.connect(self.tick)
        QApplication.instance().aboutToQuit.connect(self.stop)

    def start(self):
        self.stop()
        bridge = Bridge()
        try:
            bridge.start()
        except OSError:
            self.status.setText('The local website port is busy. Close another Website link window and try again.')
            return
        self.bridge = bridge
        self.code.setText(bridge.token)
        self.enable.setText('Create a new pairing code')
        self.status.setText('Paste this code on the official connection page, then choose Connect. Keep this window open.')
        self.timer.start()

    def tick(self):
        if not self.bridge:
            return
        if self.bridge.clock() >= self.bridge.expires:
            self.stop()
            self.status.setText('Pairing expired. Enable the link again to reconnect.')
            return
        # The network thread never touches Qt or triggers native operations.
        for action in self.bridge.take_actions(available(self.b)):
            if action == 'wave':
                self.b.greet()
            elif action == 'doubletake':
                self.b.express('doubletake')
        self.code.setText(self.bridge.token)

    def send(self,kind):
        if not self.bridge or not self.bridge.emit(kind):
            self.status.setText('Connect a visible website tab first.')
        else:
            self.status.setText('Sent to the connected website tab.')

    def stop(self):
        self.timer.stop()
        if self.bridge:
            token = self.code.text()
            self.bridge.close()
            self.bridge = None
            if QApplication.clipboard().text() == token:
                QApplication.clipboard().clear()
        self.code.clear()

    def closeEvent(self,event):
        self.stop()
        super().closeEvent(event)


def add_website_link(b, menu):
    def show():
        leader = b.owner or b
        if leader.presenting:
            return
        if not hasattr(leader,'website_link_dialog'):
            leader.website_link_dialog = WebsiteLink(leader)
        leader.website_link_dialog.show()
        leader.website_link_dialog.raise_()
        leader.website_link_dialog.activateWindow()
    menu.addAction('Website link…',show)
