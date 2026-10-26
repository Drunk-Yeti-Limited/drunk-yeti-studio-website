"""Build web brand assets from the unchanged official logo. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent.parent
logo=Image.open(ROOT/'assets/logo.png').convert('RGBA')
ink='#14242b';paper='#faf6e9';blue='#82dcf5'
def font(size):return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',size)
# Full logo on a square branded tile; preserve its proportions and transparency.
tile=Image.new('RGBA',(512,512),paper)
mark=logo.copy();mark.thumbnail((472,472),Image.Resampling.LANCZOS)
tile.alpha_composite(mark,((512-mark.width)//2,(512-mark.height)//2))
for size,name in [(32,'favicon-32.png'),(192,'icon-192.png'),(512,'icon-512.png'),(180,'apple-touch-icon.png')]:
 tile.resize((size,size),Image.Resampling.LANCZOS).save(ROOT/'assets'/name,optimize=True)
tile.save(ROOT/'favicon.ico',sizes=[(16,16),(32,32),(48,48)])
card=Image.new('RGB',(1200,630),paper);d=ImageDraw.Draw(card)
d.rectangle((690,0,1200,630),fill=blue)
for x in range(720,1200,40):d.line((x,0,x,630),fill='#65c9e5',width=1)
for y in range(20,630,40):d.line((690,y,1200,y),fill='#65c9e5',width=1)
d.rounded_rectangle((45,43,347,81),radius=19,fill=ink)
d.text((64,52),'DRUNK YETI STUDIO',font=font(18),fill='white')
for text,y,color in [('A LITTLE',134,ink),('WEIRD.',211,'#1258a7'),('A LOT TO',288,ink),('PLAY.',365,ink)]:d.text((50,y),text,font=font(67),fill=color)
d.text((55,485),'GAMES  /  TOOLS  /  ORIGINAL WORLDS',font=font(19),fill=ink)
d.line((50,548,1150,548),fill=ink,width=2)
d.text((55,574),'drunkyetistudio.com',font=font(22),fill=ink)
d.text((829,576),'KEEP IT STRANGE.',font=font(20),fill=ink)
mark=logo.copy();mark.thumbnail((470,450),Image.Resampling.LANCZOS)
card.paste(mark,(715+(470-mark.width)//2,65+(450-mark.height)//2),mark)
card.save(ROOT/'assets/social-preview-v1.png',optimize=True)
