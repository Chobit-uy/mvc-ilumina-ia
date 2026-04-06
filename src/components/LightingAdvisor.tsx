import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageCircle, Send, Lightbulb, CheckCircle, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import heroImage from '@/assets/hero-lighting.jpg';
import { API_URL } from "../config";

interface Product {
  name: string;
  price?: string;
  url: string;
  image?: string;
}

interface ApiResponse {
  answer: string;
  products: Product[];
}

interface ChatMessage {
  type: 'user' | 'assistant';
  content: string;
  products?: Product[];
}

const LightingAdvisor = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userMessage = query.trim();
    setQuery('');

    const newMessages: ChatMessage[] = [...messages, { type: 'user', content: userMessage }];
    setMessages(newMessages);
    setLoading(true);

    const history = newMessages
      .slice(-6)
      .map(m => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content }));

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage, history }),
      });

      if (!response.ok) throw new Error(`Error ${response.status}`);

      const data: ApiResponse = await response.json();
      setMessages(prev => [
        ...prev,
        { type: 'assistant', content: data.answer, products: data.products },
      ]);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error de conexion",
        description: "No se pudo conectar con el asesor. Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  function formatAssistantContent(content: string) {
    content = content.replace(/^### (.+)$/gm, '<h3 class="text-xl font-bold text-mvc-primary mb-2">$1</h3>');
    content = content.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-mvc-secondary">$1</strong>');
    content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-mvc-secondary underline">$1</a>');
    content = content.replace(/^- (.+)$/gm, '<li class="mb-1">$1</li>');
    if (content.includes('<li')) {
      content = content.replace(/(<li[\s\S]+?<\/li>)/g, '<ul class="list-disc pl-5 mb-2">$1</ul>');
    }
    content = content.replace(/\n{2,}/g, '<br><br>');
    content = content.replace(/\n/g, '<br>');
    return content;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-mvc-primary text-white py-4 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-heading font-bold">mvc</div>
            <nav className="hidden md:flex items-center space-x-6 text-sm">
              <a href="https://www.mvcequipamientos.com" className="hover:text-mvc-secondary transition-colors">INICIO</a>
              <a href="https://www.mvcequipamientos.com/c/iluminacion/" className="hover:text-mvc-secondary transition-colors">ILUMINACION</a>
              <a href="https://www.mvcequipamientos.com/contacto/" className="hover:text-mvc-secondary transition-colors">CONTACTO</a>
            </nav>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          className="h-[500px] bg-cover bg-center bg-no-repeat relative"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-mvc-primary/60"></div>
          <div className="relative z-10 container mx-auto max-w-6xl px-4 h-full flex items-center">
            <div className="text-white max-w-2xl">
              <h1 className="text-4xl md:text-6xl font-heading font-bold mb-6">
                Asesor de Iluminacion
                <br />
                <span className="text-mvc-secondary">MVC Equipamientos</span>
              </h1>
              <p className="text-xl md:text-2xl mb-8 text-gray-200">
                Pregunta lo que necesitas iluminar y te recomendamos lo ideal.
              </p>
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center">
                  <Lightbulb className="w-5 h-5 mr-2 text-mvc-secondary" />
                  <span>Asesoramiento experto</span>
                </div>
                <div className="flex items-center">
                  <CheckCircle className="w-5 h-5 mr-2 text-mvc-secondary" />
                  <span>Catalogo actualizado</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-heading font-bold mb-4">Que necesitas iluminar?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Describe tu espacio y te ayudamos a encontrar la iluminacion perfecta.
              Menciona el tipo de ambiente, metros cuadrados y si es interior o exterior.
            </p>
          </div>

          <div className="space-y-6 mb-8 min-h-[100px]">
            {messages.length === 0 && (
              <Card className="bg-mvc-accent border-none shadow-card">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-3">
                    <MessageCircle className="w-6 h-6 text-mvc-secondary mt-1 shrink-0" />
                    <div>
                      <p className="font-medium mb-2">Hola! Soy tu asesor de iluminacion de MVC</p>
                      <p className="text-muted-foreground">
                        Contame que necesitas iluminar y te ayudo a encontrar las mejores opciones del catalogo.
                        Por ejemplo: necesito iluminar una calle de 50 metros, o reflector solar para el jardin.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <Card className={`max-w-3xl w-full ${message.type === 'user'
                  ? 'bg-mvc-secondary text-white border-none'
                  : 'bg-mvc-accent border-none shadow-card'
                }`}>
                  <CardContent className="p-4">
                    {message.type === 'assistant' ? (
                      <div
                        className="space-y-2"
                        dangerouslySetInnerHTML={{ __html: formatAssistantContent(message.content) }}
                      />
                    ) : (
                      <p>{message.content}</p>
                    )}

                    {message.products && message.products.length > 0 && (
                      <div className="mt-6">
                        <h4 className="font-medium mb-4 text-mvc-primary">Opciones recomendadas:</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {message.products.map((product, pi) => (
                            <Card key={pi} className="bg-white border shadow-card hover:shadow-card-hover transition-all duration-200">
                              <CardContent className="p-4">
                                {product.image && (
                                  <img
                                    src={product.image}
                                    alt={product.name}
                                    className="w-full h-32 object-cover rounded-md mb-3"
                                  />
                                )}
                                <h5 className="font-semibold text-mvc-primary mb-2 line-clamp-2">
                                  {product.name}
                                </h5>
                                {product.price && (
                                  <Badge variant="secondary" className="mb-3">
                                    {product.price}
                                  </Badge>
                                )}
                                <Button variant="outline" size="sm" className="w-full" asChild>
                                  <a
                                    href={product.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center"
                                  >
                                    Ver producto
                                    <ExternalLink className="w-4 h-4 ml-2" />
                                  </a>
                                </Button>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <Card className="bg-mvc-accent border-none shadow-card">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <Loader2 className="w-5 h-5 animate-spin text-mvc-secondary" />
                      <span className="text-muted-foreground">Buscando las mejores opciones...</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="flex space-x-3">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ej: necesito iluminar una calle de 30 metros..."
              className="flex-1"
              disabled={loading}
            />
            <Button type="submit" disabled={!query.trim() || loading} className="px-6">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        </div>
      </section>

      <section className="py-16 bg-mvc-accent">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-heading font-bold text-center mb-12">Como funciona?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-mvc-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-heading font-semibold mb-3">Describe tu necesidad</h3>
              <p className="text-muted-foreground">Contanos que espacio queres iluminar, si es interior o exterior y el tamano aproximado.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-mvc-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                <Lightbulb className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-heading font-semibold mb-3">Analizamos el catalogo</h3>
              <p className="text-muted-foreground">La IA revisa el catalogo actualizado de MVC y selecciona los productos mas adecuados.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-mvc-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-heading font-semibold mb-3">Recibes las opciones</h3>
              <p className="text-muted-foreground">Te presentamos hasta 3 opciones con precios y links directos a la tienda.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-mvc-primary text-white py-8">
        <div className="container mx-auto max-w-6xl px-4 text-center">
          <div className="flex justify-center space-x-8 mb-4">
            <a href="https://www.mvcequipamientos.com/contacto/" className="hover:text-mvc-secondary transition-colors">Contacto</a>
            <a href="https://www.mvcequipamientos.com" className="hover:text-mvc-secondary transition-colors">Sitio principal</a>
          </div>
          <p className="text-gray-300 text-sm">
            &copy; {new Date().getFullYear()} MVC Equipamientos. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LightingAdvisor;
