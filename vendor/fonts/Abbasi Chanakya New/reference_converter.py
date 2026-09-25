from abbasi_map import *
TABLE = sorted(MULTI+SINGLE, key=lambda x:-len(x[0]))
CONS = set("कखगघङचछजझञटठडढणतथदधनपफबभमयरलळवशषसहक़ख़ग़ज़ड़ढ़फ़य़ऱऩ")
def convert(s):
    out=[]; i=0
    while i<len(s):
        ch=s[i]
        if ch in PRE_I: out.append(("PRE",PRE_I[ch])); i+=1; continue
        if ch in POST_REPH: out.append(("REPH",POST_REPH[ch])); i+=1; continue
        for k,v,_ in TABLE:
            if s.startswith(k,i): out.append(("T",v)); i+=len(k); break
        else: out.append(("T",ch)); i+=1
    # flatten with markers
    res=[]
    for t,v in out:
        if t=="T": res.extend(v)
        else: res.append((t,v))
    # pass 1: pre i-matra -> after next consonant cluster (C (़)? (् C (़)?)*)
    r=[]; pend=None; i=0
    def cluster_end(a,j):
        # a[j] is a consonant; extend over nukta and halant+consonant
        j+=1
        while j<len(a):
            if a[j]=="़": j+=1; continue
            if a[j]=="्" and j+1<len(a) and isinstance(a[j+1],str) and a[j+1] in CONS: j+=2; continue
            break
        return j
    a=res
    while i<len(a):
        x=a[i]
        if isinstance(x,tuple) and x[0]=="PRE":
            j=i+1
            if j<len(a) and isinstance(a[j],str) and a[j] in CONS:
                e=cluster_end(a,j); r.extend(a[j:e]); r.extend(x[1]); i=e; continue
            r.extend(x[1]); i+=1; continue
        r.append(x); i+=1
    # pass 2: reph -> before the syllable that precedes it
    a=r; r=[]
    for x in a:
        if isinstance(x,tuple) and x[0]=="REPH":
            # find start of last syllable in r: skip back over signs to consonant cluster start
            j=len(r)
            signs=set("ािीुूृेैोौंँ़ॅ")
            while j>0 and r[j-1] in signs: j-=1
            # now r[j-1] should be consonant (or vowel); walk back over halant chains
            if j>0: j-=1
            while j>=2 and r[j-1]=="्" and r[j-2] in CONS: j-=2
            r[j:j]=["र","्"]; r.extend(x[1])
        else: r.append(x)
    return "".join(r)
