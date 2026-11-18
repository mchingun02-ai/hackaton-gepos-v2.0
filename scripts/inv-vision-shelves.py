from PIL import Image, ImageDraw, ImageFont, ImageFile
import json
ImageFile.LOAD_TRUNCATED_IMAGES = True
P='public/products/'
def load(name,h):
    im=Image.open(P+name+'.png').convert('RGBA')
    im.thumbnail((900,900))
    px=im.load()
    for yy in range(im.height):
        for xx in range(im.width):
            r_,g_,b_,a_=px[xx,yy]
            if r_>242 and g_>242 and b_>242: px[xx,yy]=(255,255,255,0)
    bb=im.getchannel('A').getbbox()
    if bb: im=im.crop(bb)
    w=int(im.width*h/im.height)
    return im.resize((w,h),Image.LANCZOS)
def shelf(rows, W=1600, rowH=300, path='', overlap=0.0):
    H=rowH*len(rows)+40
    img=Image.new('RGB',(W,H),(214,206,192))
    d=ImageDraw.Draw(img)
    font=ImageFont.load_default(size=22)
    truth={}
    for r,row in enumerate(rows):
        y0=20+r*rowH
        d.rectangle([0,y0+rowH-28,W,y0+rowH-8],fill=(120,96,70))
        x=30
        for item in row:
            if item[0]=='GAP':
                d.rectangle([x+10,y0+rowH-60,x+110,y0+rowH-30],fill='white',outline='black')
                d.text((x+18,y0+rowH-56),item[1],fill='black',font=font)
                x+=item[2]; continue
            name,n,h,price=item
            p=load(name,h)
            step=int(p.width*(1-overlap))+6
            x0=x
            for i in range(n):
                img.paste(p,(x,y0+rowH-30-h),p)
                x+=step
            cx=(x0+x)//2
            d.rectangle([cx-50,y0+rowH-60,cx+50,y0+rowH-30],fill='white',outline='black')
            d.text((cx-42,y0+rowH-56),price,fill='black',font=font)
            truth[name]=truth.get(name,0)+n
            x+=24
        assert x<=W+24, (path,r,x)
    img.save(path,quality=88)
    return truth
T={}
T['A']=shelf([[('cola-500ml',5,230,'2500'),('water-500ml',4,220,'900')],[('juice-1l',3,250,'4800'),('milk-1l',4,250,'3900')]],path='/tmp/aiemp/vision/shelfA.jpg')
T['B']=shelf([[('chocolate',6,170,'2800')],[('cookies',5,110,'1900')],[('oil-1l',3,220,'9800'),('flour-2kg',4,210,'5600'),('GAP','4200',140)],[('tea-100g',5,190,'4200'),('coffee',3,200,'11900')]],path='/tmp/aiemp/vision/shelfB.jpg',rowH=260)
T['C']=shelf([[('bread',7,200,'1800')],[('eggs-10',4,150,'6500')],[('yogurt-500g',6,190,'3200')]],path='/tmp/aiemp/vision/shelfC.jpg',overlap=0.25)
json.dump(T,open('/tmp/aiemp/vision/truth.json','w'),ensure_ascii=False,indent=1)
print(T)
