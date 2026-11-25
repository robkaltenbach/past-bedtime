import sys
from PIL import Image
im=Image.frombytes('RGBA',(256,240),open(sys.argv[1],'rb').read()).resize((512,480),Image.NEAREST)
im.save(sys.argv[2])
